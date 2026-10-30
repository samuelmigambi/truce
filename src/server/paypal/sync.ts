import "server-only";

import type {
  Buyer,
  Case,
  CaseEvent,
  CaseMessage,
  CaseOutcome,
  CaseStatus,
  DisputeReason,
  Order,
  OrderItem,
  Shop,
} from "@/lib/domain";
import { formatMoney, toCents, type Cents } from "@/lib/money";
import { closeCase } from "@/server/actions/close";
import { notify } from "@/server/notifications";
import type { Store } from "@/server/store";
import type { PayPal } from "./client";
import { reasonOf, stageOf } from "./map";
import { orderFromPayPal } from "./orders";
import type * as P from "./types";

/**
 * Keeps a connected shop in step with its PayPal app: every dispute, resolved ones too, becomes
 * a Case linked to its order by the capture ID. An order Truce hasn't seen is filled in from
 * PayPal (capture, order, tracker). PayPal's view wins for the dispute's state; Truce's own
 * events and messages are never dropped. New disputes, buyer replies and rulings notify.
 */

/** Fields PayPal sends that types.ts doesn't list. */
export type DisputeDetails = P.Dispute & {
  evidences?: { evidence_type?: string; source?: string; notes?: string; date?: string }[];
  disputed_transactions?: (P.DisputedTransaction & {
    items?: { item_name?: string; item_quantity?: string }[];
  })[];
};

/** A live case remembers when PayPal last changed the dispute, so unchanged ones are skipped. */
type SyncedCase = Case & { paypalUpdatedAt?: string };

export interface SyncResult {
  checked: number;
  created: number;
  updated: number;
}

export interface SyncOptions {
  /** Fills in unknown orders from PayPal's capture, order and tracker APIs (on by default). */
  enrich?: boolean;
  /** Called with each case once it's up to date, for a streamed sync. */
  onCase?: (kase: Case, created: boolean) => void;
  /** Called after each dispute, with how many are done. */
  onProgress?: (done: number, total: number) => void;
}

const REASON_LABEL: Record<DisputeReason, string> = {
  not_received: "item not received",
  not_as_described: "not as described",
  unauthorized: "unauthorized payment",
  other: "another problem",
};

const DEFAULT_CLAIM: Record<DisputeReason, string> = {
  not_received: "The buyer says the item didn't arrive.",
  not_as_described: "The buyer says the item isn't as described.",
  unauthorized: "The buyer says they didn't authorize this payment.",
  other: "The buyer reported a problem with this payment.",
};

/** Where a dispute sits in the seller's inbox. */
export function statusOf(status: string): CaseStatus {
  switch (status) {
    case "WAITING_FOR_SELLER_RESPONSE":
    case "OPEN":
      return "needs_you";
    case "WAITING_FOR_BUYER_RESPONSE":
      return "waiting_buyer";
    case "RESOLVED":
      return "closed";
    default:
      return "with_paypal";
  }
}

/** How a resolved dispute ended, in Truce's terms, and what went back to the buyer. */
export function outcomeOf(dispute: P.Dispute): { outcome: CaseOutcome | null; refunded: Cents } {
  const amount = toCents(dispute.dispute_amount.value);
  const value = dispute.dispute_outcome?.amount_refunded?.value;
  const refunded = value ? toCents(value) : 0;
  const partial = refunded > 0 && refunded < amount;
  switch (dispute.dispute_outcome?.outcome_code) {
    case "RESOLVED_SELLER_FAVOUR":
    case "RESOLVED_WITH_PAYOUT":
    case "DENIED":
      return { outcome: "won", refunded: 0 };
    case "CANCELED_BY_BUYER":
      return { outcome: "buyer_closed", refunded: 0 };
    case "ACCEPTED":
      return partial
        ? { outcome: "settled", refunded }
        : { outcome: "refunded", refunded: refunded || amount };
    case "RESOLVED_BUYER_FAVOUR":
      return partial
        ? { outcome: "settled", refunded }
        : { outcome: "lost", refunded: refunded || amount };
    default:
      return { outcome: null, refunded };
  }
}

const sameMessage = (a: CaseMessage, b: CaseMessage) =>
  a.from === b.from && a.text.trim().replace(/\s+/g, " ") === b.text.trim().replace(/\s+/g, " ");

/** PayPal's messages, plus any of Truce's own that PayPal doesn't show yet, oldest first. */
function mergeMessages(dispute: P.Dispute, local: CaseMessage[]): CaseMessage[] {
  const from = { BUYER: "buyer", SELLER: "seller", ARBITER: "paypal" } as const;
  const remote: CaseMessage[] = (dispute.messages ?? [])
    .filter((m) => m.content?.trim())
    .map((m, i) => ({
      id: `pp-m${i + 1}-${Date.parse(m.time_posted) || 0}`,
      from: from[m.posted_by] ?? "paypal",
      at: m.time_posted,
      text: m.content!.trim(),
    }));
  const kept = local.filter((m) => !remote.some((r) => sameMessage(r, m)));
  return [...remote, ...kept].sort((a, b) => a.at.localeCompare(b.at));
}

/** The buyer's own words: their first message, or the note they filed with the dispute. */
function buyerWords(dispute: DisputeDetails): string | null {
  const message = dispute.messages?.find((m) => m.posted_by === "BUYER" && m.content?.trim());
  if (message?.content) return message.content.trim();
  const note = dispute.evidences?.find((e) => e.source === "SUBMITTED_BY_BUYER" && e.notes?.trim());
  return note?.notes?.trim() ?? null;
}

function transactionItems(dispute: DisputeDetails): string | null {
  const items = dispute.disputed_transactions?.[0]?.items ?? [];
  const parts = items
    .filter((i) => i.item_name)
    .map((i) =>
      Number(i.item_quantity) > 1 ? `${Number(i.item_quantity)} × ${i.item_name}` : i.item_name!,
    );
  return parts.length ? parts.join(", ") : null;
}

/** A dispute as a Case, keeping what Truce already knew about it. Closing is left to closeCase. */
export function caseFromDispute(
  dispute: DisputeDetails,
  existing: SyncedCase | null,
  order: Order,
): SyncedCase {
  const tx = dispute.disputed_transactions?.[0];
  const reason = reasonOf(dispute.reason);
  const mapped = statusOf(dispute.status);
  const buyer: Buyer = {
    name: tx?.buyer?.name?.trim() || order.buyer.name,
    email: tx?.buyer?.email?.trim() || order.buyer.email,
  };
  // A case closed here (say, by accepting the claim) stays closed while PayPal catches up.
  const status: CaseStatus =
    existing?.status === "closed" ? "closed" : mapped === "closed" ? "with_paypal" : mapped;
  return {
    ...(existing ?? {}),
    id: existing?.id ?? dispute.dispute_id,
    paypalDisputeId: dispute.dispute_id,
    orderId: order.id,
    reason,
    stage: stageOf(dispute),
    status,
    amount: toCents(dispute.dispute_amount.value),
    buyer,
    itemSummary: transactionItems(dispute) ?? existing?.itemSummary ?? summarize(order.items),
    openedAt: dispute.create_time,
    dueAt: dispute.seller_response_due_date ?? null,
    buyerClaim: buyerWords(dispute) ?? existing?.buyerClaim ?? DEFAULT_CLAIM[reason],
    messages: mergeMessages(dispute, existing?.messages ?? []),
    photos: existing?.photos ?? [],
    outcome: existing?.outcome ?? null,
    closedAt: existing?.closedAt ?? null,
    moneyKept: existing?.moneyKept ?? 0,
    feeCharged: existing?.feeCharged ?? 0,
    feeAvoided: existing?.feeAvoided ?? 0,
    updatedAt: dispute.update_time,
    paypalUpdatedAt: dispute.update_time,
    paypalActions: actionsOf(dispute),
  };
}

/** What PayPal lets the seller do now, by its links' names ("provide_supporting_info"…). */
export function actionsOf(dispute: P.Dispute): string[] {
  return [
    ...new Set(
      (dispute.links ?? [])
        .map((link) => link.rel.toLowerCase().replace(/-/g, "_"))
        .filter((rel) => rel !== "self"),
    ),
  ];
}

function summarize(items: OrderItem[]): string {
  return (
    items.map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.name}` : i.name)).join(", ") ||
    "PayPal payment"
  );
}

/** The stored order a dispute is about: by capture ID, then by the shop's order number. */
export function findOrder(dispute: DisputeDetails, orders: Order[]): Order | null {
  const tx = dispute.disputed_transactions?.[0];
  const capture = tx?.seller_transaction_id;
  const byCapture = capture ? orders.find((o) => o.captureId === capture) : undefined;
  if (byCapture) return byCapture;
  const numbers = [tx?.custom, tx?.invoice_number].filter((n): n is string => Boolean(n?.trim()));
  return orders.find((o) => numbers.includes(o.id)) ?? null;
}

/** An order made from the dispute's own transaction, for a payment the shop never stored. */
export function orderFromDispute(dispute: DisputeDetails): Order {
  const tx = dispute.disputed_transactions?.[0];
  const amount = toCents(tx?.gross_amount?.value ?? dispute.dispute_amount.value);
  const listed = (tx?.items ?? []).filter((i) => i.item_name);
  const items: OrderItem[] = listed.length
    ? listed.map((i) => {
        const quantity = Math.max(1, Number(i.item_quantity) || 1);
        return {
          productId: "unknown",
          name: i.item_name!,
          quantity,
          unitPrice: Math.round(amount / quantity / listed.length),
        };
      })
    : [{ productId: "unknown", name: "PayPal payment", quantity: 1, unitPrice: amount }];
  return {
    id:
      tx?.custom?.trim() ||
      tx?.invoice_number?.trim() ||
      `PP-${tx?.seller_transaction_id ?? dispute.dispute_id}`,
    paypalOrderId: null,
    captureId: tx?.seller_transaction_id ?? null,
    buyer: {
      name: tx?.buyer?.name?.trim() || "PayPal buyer",
      email: tx?.buyer?.email?.trim() || "",
    },
    items,
    placedAt: tx?.create_time ?? dispute.create_time,
    status: "paid",
    amount,
    protection: null,
    paypalAddress: null,
    shipTo: null,
    tracking: null,
  };
}

const EVIDENCE_LABEL: Record<string, string> = {
  PROOF_OF_FULFILLMENT: "proof of fulfillment",
  PROOF_OF_REFUND: "proof of refund",
  PROOF_OF_DELIVERY_SIGNATURE: "a delivery signature",
  PROOF_OF_RECEIPT_COPY: "a copy of the receipt",
  OTHER: "other evidence",
};

/** Events for what changed at PayPal. Their IDs are fixed, so syncing twice never doubles them. */
function syncEvents(
  dispute: DisputeDetails,
  before: SyncedCase | null,
  after: SyncedCase,
): CaseEvent[] {
  const id = dispute.dispute_id;
  const events: CaseEvent[] = [];
  if (!before) {
    const opened = after.stage === "inquiry" ? "opened an inquiry" : "filed a claim";
    events.push({
      id: `pp-${id}-opened`,
      at: dispute.create_time,
      kind: "opened",
      actor: "buyer",
      title: `${after.buyer.name} ${opened}: ${REASON_LABEL[after.reason]}`,
    });
  }
  const wanted = [
    ...new Set(
      (dispute.evidences ?? [])
        .filter((e) => e.source === "REQUESTED_FROM_SELLER" && e.evidence_type)
        .map(
          (e) =>
            EVIDENCE_LABEL[e.evidence_type!] ?? e.evidence_type!.toLowerCase().replace(/_/g, " "),
        ),
    ),
  ];
  if (wanted.length && (!before || before.status !== after.status)) {
    events.push({
      id: `pp-${id}-asked-${after.status}`,
      at: dispute.update_time,
      kind: "note",
      actor: "paypal",
      title: `PayPal asked for ${wanted.join(", ")}`,
    });
  }
  if (before?.stage === "inquiry" && after.stage !== "inquiry") {
    events.push({
      id: `pp-${id}-escalated`,
      at: dispute.update_time,
      kind: "escalated",
      actor: "buyer",
      title: `${after.buyer.name} escalated it to a claim`,
    });
  }
  return events;
}

type Money = (cents: Cents) => string;

const CLOSED_TITLE: Record<CaseOutcome, (amount: Cents, refunded: Cents, money: Money) => string> =
  {
    won: (amount, _, money) => `Closed: PayPal ruled in your favor, and you kept ${money(amount)}`,
    lost: (_, refunded, money) =>
      `Closed: PayPal ruled for the buyer, and ${money(refunded)} went back to them`,
    settled: (_, refunded, money) => `Closed: settled for ${money(refunded)}`,
    refunded: (_, refunded, money) => `Closed: ${money(refunded)} refunded to the buyer`,
    buyer_closed: () => "Closed: the buyer closed the case",
  };

/** The notifications a change in a dispute makes. Their IDs are fixed, so they never repeat. */
async function notifyChange(
  store: Store,
  shop: Shop,
  before: SyncedCase | null,
  after: Case,
  dispute: DisputeDetails,
): Promise<void> {
  const id = dispute.dispute_id;
  if (!before) {
    // One that arrives already resolved is history, not news.
    if (statusOf(dispute.status) === "closed") return;
    await notify(store, shop.id, {
      id: `opened:${id}`,
      kind: "dispute_opened",
      title: `New dispute: ${after.buyer.name}, ${formatMoney(after.amount, shop.currency)}`,
      detail: `${REASON_LABEL[after.reason]} · ${after.itemSummary}`,
      caseId: after.id,
      at: after.openedAt,
    });
    return;
  }
  const lastBuyer = [...after.messages].reverse().find((m) => m.from === "buyer");
  const known = lastBuyer
    ? before.messages.some((m) => m.from === "buyer" && sameMessage(m, lastBuyer))
    : true;
  if (lastBuyer && !known) {
    await notify(store, shop.id, {
      id: `reply:${id}:${lastBuyer.at}`,
      kind: "buyer_reply",
      title: `${after.buyer.name} replied`,
      detail: lastBuyer.text.slice(0, 140),
      caseId: after.id,
      at: lastBuyer.at,
    });
  }
  if (before.stage === "inquiry" && after.stage !== "inquiry") {
    await notify(store, shop.id, {
      id: `escalated:${id}`,
      kind: "dispute_updated",
      title: `${after.buyer.name} escalated the dispute to a claim`,
      caseId: after.id,
    });
  }
}

/**
 * Saves one dispute's state as a case, links its order (filled in from PayPal when `client` is
 * given and the order is new), records events and notifications, and closes it if resolved.
 */
export async function applyDispute(
  store: Store,
  shop: Shop,
  dispute: DisputeDetails,
  existing: SyncedCase | null,
  orders: Order[],
  client: PayPal | null = null,
): Promise<Case> {
  let order = findOrder(dispute, orders);
  if (!order) {
    const base = orderFromDispute(dispute);
    order = client && base.captureId ? await orderFromPayPal(client, base.captureId, base) : base;
    await store.saveOrder(shop.id, order);
    orders.push(order);
  }
  const next = caseFromDispute(dispute, existing, order);
  await store.saveCase(shop.id, next);
  for (const event of syncEvents(dispute, existing, next)) {
    await store.addEvent(shop.id, next.id, event);
  }
  await notifyChange(store, shop, existing, next, dispute);
  if (statusOf(dispute.status) !== "closed" || existing?.status === "closed") return next;

  const { outcome, refunded } = outcomeOf(dispute);
  const ending = outcome ?? (refunded > 0 ? "refunded" : "buyer_closed");
  const at = new Date(dispute.update_time);
  const closed = await closeCase(store, shop, next, ending, refunded, at);
  const title = CLOSED_TITLE[ending](closed.amount, refunded, (cents) =>
    formatMoney(cents, shop.currency),
  );
  await store.addEvent(shop.id, closed.id, {
    id: `pp-${dispute.dispute_id}-closed`,
    at: at.toISOString(),
    kind: "closed",
    actor: "paypal",
    title,
  });
  if (existing) {
    await notify(store, shop.id, {
      id: `closed:${dispute.dispute_id}`,
      kind: "decided",
      title,
      detail: `${closed.buyer.name} · ${closed.itemSummary}`,
      caseId: closed.id,
      at: at.toISOString(),
    });
  }
  return closed;
}

/** Every dispute PayPal lists for the shop, resolved ones included, a few pages at most. */
async function listAll(client: PayPal): Promise<P.DisputeSummary[]> {
  const seen = new Map<string, P.DisputeSummary>();
  for (let page = 1; page <= 5; page++) {
    const list = await client.listDisputes({ pageSize: 50, page });
    for (const item of list.items ?? []) seen.set(item.dispute_id, item);
    if (!list.links?.some((l) => l.rel === "next") || !list.items?.length) break;
  }
  return [...seen.values()];
}

/** Brings every dispute up to date; details are fetched only for disputes that changed. */
export async function syncDisputes(
  store: Store,
  shop: Shop,
  client: PayPal,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const summaries = await listAll(client);
  const [cases, orders] = await Promise.all([store.listCases(shop.id), store.listOrders(shop.id)]);
  const known = new Map(cases.map((c) => [c.paypalDisputeId, c as SyncedCase]));
  const result: SyncResult = { checked: summaries.length, created: 0, updated: 0 };
  let done = 0;
  for (const summary of summaries) {
    const existing = known.get(summary.dispute_id) ?? null;
    // A case from before Truce kept PayPal's allowed actions is read again once to fill them in.
    const stale = !existing || existing.paypalUpdatedAt !== summary.update_time;
    if (stale || !existing.paypalActions) {
      const dispute = (await client.getDispute(summary.dispute_id)) as DisputeDetails;
      const enrichWith = options.enrich === false ? null : client;
      const saved = await applyDispute(store, shop, dispute, existing, orders, enrichWith);
      if (existing) result.updated++;
      else result.created++;
      options.onCase?.(saved, !existing);
    } else {
      options.onCase?.(existing, false);
    }
    options.onProgress?.(++done, summaries.length);
  }
  return result;
}

/** Brings one dispute up to date, as a webhook or an approval asks. */
export async function syncDispute(
  store: Store,
  shop: Shop,
  client: PayPal,
  disputeId: string,
): Promise<Case> {
  const [dispute, cases, orders] = await Promise.all([
    client.getDispute(disputeId) as Promise<DisputeDetails>,
    store.listCases(shop.id),
    store.listOrders(shop.id),
  ]);
  const existing =
    (cases.find((c) => c.paypalDisputeId === disputeId) as SyncedCase | undefined) ?? null;
  return applyDispute(store, shop, dispute, existing, orders, client);
}

const syncKey = (shopId: string) => `sync:${shopId}`;

/** Notes a full sync just ran, so the reads that follow don't run another for a minute. */
export async function markSynced(store: Store, shopId: string, now = new Date()): Promise<void> {
  await store.setCached(syncKey(shopId), now.toISOString(), 24 * 60 * 60).catch(() => undefined);
}

/** Syncs at most once a minute, however many pages ask at once. */
export async function syncIfStale(
  store: Store,
  shop: Shop,
  client: PayPal,
  maxAgeMs = 60_000,
  now = new Date(),
): Promise<SyncResult | null> {
  const last = await store.getCached<string>(syncKey(shop.id));
  if (last && now.getTime() - Date.parse(last) < maxAgeMs) return null;
  // Claim the slot first, so parallel reads don't all call PayPal.
  await store.setCached(syncKey(shop.id), now.toISOString(), 24 * 60 * 60);
  return syncDisputes(store, shop, client);
}
