import "server-only";

import { z } from "zod";
import type { ChatCard } from "@/lib/api-types";
import type { Analysis, Case, Draft, Move, Order, Shop } from "@/lib/domain";
import { formatMoney, type Cents } from "@/lib/money";
import { addressNote } from "@/lib/notes";
import { dueLabel } from "@/lib/rules/deadlines";
import { DISPUTE_FEES } from "@/lib/rules/fees";
import { suggestOffer } from "@/lib/rules/options";
import { shippingChecks } from "@/lib/rules/protection";
import { RATIO_LINE } from "@/lib/rules/ratio";
import { shopRatio } from "@/server/metrics";
import type { Store } from "@/server/store/types";
import type { Budget } from "../budget";
import type { AiClient } from "../client";
import { formatDay } from "../dates";
import { closedSummary, findSimilar } from "../embeddings";
import { ToolInputError, type Tool } from "../loop";
import type { Job, Usage } from "../models";
import { REASON_LABEL } from "../prompts";
import { clean, fence } from "../safety";
import { salesKnown, type ShopLocale } from "../shop";

/**
 * Ask Truce's tools. Each one reads the shop through the store and answers in plain JSON for the
 * model, with a card for the app where it helps. Dates are on the shop's calendar and money is in
 * its currency. None of them changes anything: prepare_action only builds an action card, and the
 * seller approves it in the app.
 */

export interface ChatContext {
  store: Store;
  shop: Shop;
  client: AiClient;
  models: Record<Job, string>;
  now: Date;
  budget: Budget;
  /** Model calls made inside tools (embeddings), reported once the tool is done. */
  usage: { model: string; usage: Usage }[];
  signal?: AbortSignal;
  cache?: { cases?: Case[]; orders?: Order[] };
}

async function casesOf(ctx: ChatContext): Promise<Case[]> {
  ctx.cache ??= {};
  ctx.cache.cases ??= await ctx.store.listCases(ctx.shop.id);
  return ctx.cache.cases;
}

async function ordersOf(ctx: ChatContext): Promise<Order[]> {
  ctx.cache ??= {};
  ctx.cache.orders ??= await ctx.store.listOrders(ctx.shop.id);
  return ctx.cache.orders;
}

/** The shop's money and calendar, as the tools write them. */
function writer(shop: ShopLocale) {
  return {
    money: (cents: Cents) => formatMoney(cents, shop.currency),
    day: (iso: string) => formatDay(iso, shop.timeZone),
  };
}

const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "for",
  "with",
  "my",
  "our",
  "we",
  "case",
  "dispute",
  "order",
  "one",
  "about",
  "from",
  "to",
  "on",
  "in",
]);

/** Cases matching an ID, a dispute or order number, a buyer's name or words about the item, best first. */
export function matchCases(cases: Case[], query: string): Case[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact = cases.filter((c) =>
    [c.id, c.paypalDisputeId, c.orderId].some((v) => v.toLowerCase() === q),
  );
  if (exact.length) return exact;
  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w));
  if (words.length === 0) return [];
  const scored = cases
    .map((c) => {
      const name = c.buyer.name.toLowerCase();
      const haystack =
        `${name} ${c.itemSummary} ${c.buyerClaim} ${REASON_LABEL[c.reason]} ${c.outcome ?? ""} ${c.id}`.toLowerCase();
      const score = words.reduce(
        (sum, w) => sum + (name.split(/\s+/).includes(w) ? 3 : haystack.includes(w) ? 1 : 0),
        0,
      );
      return { c, score };
    })
    .filter((s) => s.score > 0);
  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(a.c.status === "closed") - Number(b.c.status === "closed") ||
        b.c.openedAt.localeCompare(a.c.openedAt),
    )
    .map((s) => s.c);
}

function pickCase(cases: Case[], query: string, what = "case"): Case {
  const found = matchCases(cases, query);
  if (found.length === 0)
    throw new ToolInputError(
      `No ${what} matches "${query}". If that's an order number, call get_order with it. Call list_cases to see the cases.`,
    );
  return found[0]!;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function caseRow(c: Case, ctx: ChatContext, analysis: Analysis | null) {
  return {
    id: c.id,
    dispute: c.paypalDisputeId,
    buyer: c.buyer.name,
    item: c.itemSummary,
    amount: formatMoney(c.amount, ctx.shop.currency),
    reason: REASON_LABEL[c.reason],
    stage: c.stage,
    status: c.status,
    due: c.dueAt && c.status !== "closed" ? dueLabel(new Date(c.dueAt), ctx.now) : null,
    outcome: c.outcome,
    truce: analysis
      ? { move: analysis.recommendation.move, headline: analysis.recommendation.headline }
      : null,
  };
}

const CaseQuery = z.object({
  case: z
    .string()
    .min(1)
    .describe(
      "A case ID or PayPal dispute ID as list_cases shows it, the buyer's name, or words about the item",
    ),
});

export const listCases: Tool<
  { filter: "open" | "needs_you" | "waiting_buyer" | "with_paypal" | "closed" | "all" },
  ChatContext
> = {
  name: "list_cases",
  description:
    "The shop's dispute cases with buyer, item, amount, reason, stage, deadline and Truce's recommended move. Open cases unless the filter says 'closed' or 'all'.",
  input: z.object({
    filter: z
      .enum(["open", "needs_you", "waiting_buyer", "with_paypal", "closed", "all"])
      .default("open"),
  }),
  pending: "Looking through the cases",
  async run({ filter }, ctx) {
    const cases = (await casesOf(ctx))
      .filter((c) =>
        filter === "all" ? true : filter === "open" ? c.status !== "closed" : c.status === filter,
      )
      .sort(
        (a, b) =>
          (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9") || b.openedAt.localeCompare(a.openedAt),
      )
      .slice(0, 25);
    const analyses = await Promise.all(
      cases.map((c) => ctx.store.getAnalysis(ctx.shop.id, c.id).catch(() => null)),
    );
    const rows = cases.map((c, i) => caseRow(c, ctx, analyses[i] ?? null));
    const noun = filter === "open" ? "open case" : filter === "closed" ? "closed case" : "case";
    return { content: { cases: rows }, label: `Found ${plural(rows.length, noun, `${noun}s`)}` };
  },
};

export const getCase: Tool<{ case: string }, ChatContext> = {
  name: "get_case",
  description:
    "One case in full: the buyer's words, messages, the order, its timeline, and Truce's analysis if there is one.",
  input: CaseQuery,
  pending: "Opening the case",
  async run({ case: query }, ctx) {
    const { money, day } = writer(ctx.shop);
    const kase = pickCase(await casesOf(ctx), query);
    const [order, events, analysis] = await Promise.all([
      ctx.store.getOrder(ctx.shop.id, kase.orderId),
      ctx.store.listEvents(ctx.shop.id, kase.id),
      ctx.store.getAnalysis(ctx.shop.id, kase.id),
    ]);
    const content = {
      ...caseRow(kase, ctx, analysis),
      opened: day(kase.openedAt),
      buyerClaim: fence("buyer", kase.buyerClaim, 800),
      messages: kase.messages.slice(-6).map((m) => ({
        from: m.from,
        at: day(m.at),
        text:
          m.from === "seller"
            ? m.text
            : fence(m.from === "buyer" ? "buyer" : "paypal", m.text, 800),
      })),
      photos: kase.photos.map((p) => p.caption),
      order: order ? orderFacts(order, ctx.shop) : null,
      timeline: events
        .slice(-8)
        .map((e) => `${day(e.at)}: ${e.title}${e.detail ? ` (${e.detail})` : ""}`),
      analysis: analysis
        ? {
            move: analysis.recommendation.move,
            confidence: analysis.recommendation.confidence,
            headline: analysis.recommendation.headline,
            reasons: analysis.recommendation.reasons.map((r) => r.text),
            costs: analysis.options
              .filter((o) => o.available)
              .map((o) => ({ move: o.move, expected: money(o.expected), fee: money(o.fee) })),
            draftChecked: analysis.verification.ok,
          }
        : "Not analyzed yet.",
    };
    const card: ChatCard = { kind: "case", caseId: kase.id };
    return { content, label: `${kase.buyer.name} · ${kase.itemSummary}`, card };
  },
};

function orderFacts(order: Order, shop: ShopLocale) {
  const { money, day } = writer(shop);
  const checks = shippingChecks(order);
  const lastScan = order.tracking?.events?.at(-1);
  return {
    id: order.id,
    buyer: order.buyer.name,
    items: order.items.map((i) => `${i.quantity} × ${i.name}`).join(", "),
    amount: money(order.amount),
    placed: day(order.placedAt),
    status: order.status,
    sellerProtection: order.protection,
    tracking: order.tracking
      ? {
          carrier: order.tracking.carrier,
          number: order.tracking.number,
          onPayPal: order.tracking.uploaded,
          delivered: order.tracking.deliveredAt ? day(order.tracking.deliveredAt) : null,
          lastScan: lastScan
            ? `${day(lastScan.at)}: ${lastScan.detail}`
            : "No carrier scans on file",
          ...(order.tracking.paypalStatus ? { paypalStatus: order.tracking.paypalStatus } : {}),
        }
      : null,
    checks: checks.checks.map((c) => ({ ok: c.ok, check: c.label })),
    buyerNote: order.note ? fence("buyer", order.note, 500) : null,
  };
}

export const getOrder: Tool<{ order: string }, ChatContext> = {
  name: "get_order",
  description:
    "One order: items, amount, tracking, Seller Protection status and the before-shipping checks.",
  input: z.object({
    order: z.string().min(1).describe("An order number as the case shows it, or the buyer's name"),
  }),
  pending: "Opening the order",
  async run({ order: query }, ctx) {
    const orders = await ordersOf(ctx);
    const q = query.trim().toLowerCase();
    const order =
      orders.find((o) => o.id.toLowerCase() === q) ??
      orders
        .filter((o) => o.buyer.name.toLowerCase().includes(q))
        .sort((a, b) => b.placedAt.localeCompare(a.placedAt))[0];
    if (!order)
      throw new ToolInputError(
        `No order matches "${query}". Use the order number a case shows, or the buyer's name.`,
      );
    const card: ChatCard = { kind: "order", orderId: order.id };
    const addressOff = shippingChecks(order).checks.some((c) => c.id === "address" && !c.ok);
    return {
      content: {
        ...orderFacts(order, ctx.shop),
        // The note the Orders screen shows the seller, for when they ask to reword it.
        noteToBuyer: addressOff ? addressNote(order, ctx.shop.name) : null,
      },
      label: `Order ${order.id} · ${order.buyer.name}`,
      card,
    };
  },
};

export const ordersAtRisk: Tool<{ days: number }, ChatContext> = {
  name: "orders_at_risk",
  description:
    "Orders waiting to ship that would lose Seller Protection (a label address that differs from PayPal's, an ineligible payment), and open cases due within the next few days.",
  input: z.object({
    days: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(7)
      .describe("How many days ahead to look for deadlines"),
  }),
  pending: "Checking orders before they ship",
  async run({ days }, ctx) {
    const { money } = writer(ctx.shop);
    const [orders, cases] = await Promise.all([ordersOf(ctx), casesOf(ctx)]);
    const toShip = orders.filter((o) => o.status === "paid" || o.status === "label_created");
    const flagged = toShip
      .map((o) => ({ o, checks: shippingChecks(o) }))
      .filter(({ checks }) => !checks.covered)
      .map(({ o, checks }) => ({
        order: o.id,
        buyer: o.buyer.name,
        amount: money(o.amount),
        problems: checks.checks.filter((c) => !c.ok).map((c) => c.label),
        buyerNote: o.note ? fence("buyer", o.note, 500) : null,
        draftedNote: checks.checks.some((c) => c.id === "address" && !c.ok)
          ? addressNote(o, ctx.shop.name)
          : null,
      }));
    const horizon = ctx.now.getTime() + days * 24 * 60 * 60 * 1000;
    const due = cases
      .filter((c) => c.status !== "closed" && c.dueAt && Date.parse(c.dueAt) <= horizon)
      .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))
      .map((c) => ({
        buyer: c.buyer.name,
        item: c.itemSummary,
        amount: money(c.amount),
        due: dueLabel(new Date(c.dueAt!), ctx.now),
      }));
    const content = {
      readyToShip: toShip.length,
      atRisk: flagged,
      clear: toShip.filter((o) => shippingChecks(o).covered).map((o) => o.id),
      casesDueWithinDays: { days, cases: due },
    };
    const cards: ChatCard[] = flagged.map((f) => ({ kind: "order", orderId: f.order }));
    return {
      content,
      label: flagged.length
        ? `${plural(flagged.length, "order", "orders")} at risk`
        : "No orders at risk",
      cards,
    };
  },
};

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

export const claimsRatioTool: Tool<Record<string, never>, ChatContext> = {
  name: "claims_ratio",
  description:
    "The shop's claims ratio over the last 90 days against PayPal's 1.5% line, and how many more claims it can take before fees go up.",
  input: z.object({}),
  pending: "Working out the claims ratio",
  async run(_input, ctx) {
    const known = salesKnown(ctx.shop);
    const ratio = shopRatio(await ordersOf(ctx), await casesOf(ctx), ctx.now.getTime(), known);
    const highVolumeFee = formatMoney(DISPUTE_FEES.highVolume, ctx.shop.currency);
    const label = "Claims ratio, last 90 days";
    if (!ratio.known) {
      return {
        content: {
          ratio: "unknown",
          line: pct(RATIO_LINE),
          claims: ratio.claims,
          sales: "unknown",
          overTheLine: false,
          meaning:
            "The claims ratio is unknown: the shop's sales history isn't available, because its PayPal app doesn't have Transaction Search, so Truce only sees the orders that have disputes. Truce treats the shop as under the line for fees. Turning on Transaction Search for the app lets Truce work the ratio out.",
        },
        label: "Claims ratio unknown without the sales history",
        card: { kind: "metric", label, value: "Unknown" } satisfies ChatCard,
      };
    }
    const content = {
      ratio: pct(ratio.ratio),
      line: pct(RATIO_LINE),
      sales: ratio.sales,
      claims: ratio.claims,
      headroom: ratio.headroom,
      overTheLine: ratio.highVolume,
      meaning: ratio.highVolume
        ? `Over the line: every claim now costs the ${highVolumeFee} high-volume fee, even when the shop wins.`
        : `Under the line: ${plural(ratio.headroom, "more claim", "more claims")} before the ${highVolumeFee} high-volume fee applies.`,
    };
    const card: ChatCard = { kind: "metric", label, value: pct(ratio.ratio) };
    return { content, label: `Claims ratio ${pct(ratio.ratio)}`, card };
  },
};

export const explainOutcome: Tool<{ case: string }, ChatContext> = {
  name: "explain_outcome",
  description:
    "Why a closed case ended the way it did: the outcome, the money and fees, what the seller sent, and PayPal's decision.",
  input: CaseQuery,
  pending: "Reading how it ended",
  async run({ case: query }, ctx) {
    const { money, day } = writer(ctx.shop);
    const closed = (await casesOf(ctx)).filter((c) => c.status === "closed");
    const kase = pickCase(closed, query, "closed case");
    const events = await ctx.store.listEvents(ctx.shop.id, kase.id);
    const content = {
      case: kase.id,
      buyer: kase.buyer.name,
      item: kase.itemSummary,
      reason: REASON_LABEL[kase.reason],
      stageItEndedAt: kase.stage,
      summary: closedSummary(kase, ctx.shop.currency),
      opened: day(kase.openedAt),
      closed: kase.closedAt ? day(kase.closedAt) : null,
      buyerClaim: fence("buyer", kase.buyerClaim, 600),
      money: {
        kept: money(kase.moneyKept),
        feeCharged: money(kase.feeCharged),
        feeAvoided: money(kase.feeAvoided),
      },
      timeline: events.map(
        (e) => `${day(e.at)} · ${e.actor}: ${e.title}${e.detail ? ` (${e.detail})` : ""}`,
      ),
      paypalSaid: kase.messages
        .filter((m) => m.from === "paypal")
        .map((m) => fence("paypal", m.text, 600)),
      sellerSaid: kase.messages.filter((m) => m.from === "seller").map((m) => m.text),
    };
    const card: ChatCard = { kind: "case", caseId: kase.id };
    return { content, label: `${kase.itemSummary}: ${kase.outcome ?? "closed"}`, card };
  },
};

export const similarCases: Tool<{ case: string }, ChatContext> = {
  name: "similar_cases",
  description:
    "Closed cases most like a given case, found by meaning with embeddings, with how each ended.",
  input: CaseQuery,
  pending: "Finding similar cases",
  async run({ case: query }, ctx) {
    const cases = await casesOf(ctx);
    const kase = pickCase(cases, query);
    const closed = cases.filter((c) => c.status === "closed" && c.id !== kase.id);
    const found = await findSimilar(ctx.client, ctx.store, ctx.models.embed, kase, closed, {
      currency: ctx.shop.currency,
      signal: ctx.signal,
      attemptTimeoutMs: 12_000,
    });
    if (found.usage) ctx.usage.push({ model: ctx.models.embed, usage: found.usage });
    const n = found.similar.length;
    return {
      content: { case: kase.id, similar: found.similar },
      label: n
        ? `${plural(n, "similar closed case", "similar closed cases")}`
        : "No similar closed cases",
    };
  },
};

const ACTION_VERB: Record<Move, string> = { fight: "Contest", settle: "Offer", refund: "Refund" };

/** The words for an action the seller asked for when there's no matching verified draft. */
function plainDraftText(
  kase: Case,
  order: Order | null,
  move: Move,
  offer: Cents,
  shop: ShopLocale & Pick<Shop, "name">,
): string {
  const { money, day } = writer(shop);
  const first = kase.buyer.name.split(/\s+/)[0] ?? kase.buyer.name;
  const sign = `\n\nWarm regards,\n${shop.name}`;
  if (move === "refund")
    return `Hi ${first},\n\nWe're sorry about your order. We're refunding the full ${money(kase.amount)} to your PayPal account. Thank you for your patience.${sign}`;
  if (move === "settle")
    return `Hi ${first},\n\nWe're sorry it wasn't what you expected. We'd like to offer a partial refund of ${money(offer)}, and you keep the item.${sign}`;
  const delivered = order?.tracking?.deliveredAt;
  if (kase.stage !== "inquiry") {
    return [
      order ? `Order ${order.id} for ${money(order.amount)} was paid through PayPal.` : "",
      order?.tracking
        ? `It shipped with ${order.tracking.carrier} tracking ${order.tracking.number}.`
        : "",
      delivered ? `${order!.tracking!.carrier} shows it delivered on ${day(delivered)}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return `Hi ${first},\n\nThank you for your message. ${delivered ? `Our tracking shows the order was delivered on ${day(delivered)}.` : "We're checking on your order with the carrier."} If anything's still wrong, reply here and we'll help.${sign}`;
}

export const prepareAction: Tool<{ case: string; move: Move; message?: string }, ChatContext> = {
  name: "prepare_action",
  description:
    "Prepares an action on an open case (fight, settle with a partial refund offer, or refund) as a card the seller approves in the app. Use it whenever the seller asks for one, analyzed or not; it finds the case from the buyer's name. Nothing is sent until they approve.",
  input: z.object({
    case: CaseQuery.shape.case,
    move: z.enum(["fight", "settle", "refund"]),
    message: z
      .string()
      .max(1500)
      .optional()
      .describe(
        "The whole message to the buyer, written as the seller, when the seller asked for something specific (an apology, a detail): greet the buyer by first name, say plainly what's happening (for a refund, the amount going back to their PayPal account), include what the seller asked for, and sign off with the shop's name. Two to four warm sentences. Leave it out to use Truce's checked draft.",
      ),
  }),
  pending: "Preparing the action",
  async run({ case: query, move, message }, ctx) {
    const kase = pickCase(
      (await casesOf(ctx)).filter((c) => c.status !== "closed"),
      query,
      "open case",
    );
    if (move === "settle" && kase.stage !== "inquiry") {
      throw new ToolInputError(
        "Offers end once an inquiry becomes a claim, and this one is a claim. Choose fight or refund.",
      );
    }
    const [order, analysis] = await Promise.all([
      ctx.store.getOrder(ctx.shop.id, kase.orderId),
      ctx.store.getAnalysis(ctx.shop.id, kase.id),
    ]);
    const same = analysis?.recommendation.move === move;
    const offer =
      move === "settle"
        ? ((same ? analysis?.recommendation.offerAmount : undefined) ?? suggestOffer(kase.amount))
        : 0;
    const words = message?.trim() ? clean(message, 1500) : null;
    let draft: Draft;
    if (same && !words && analysis) {
      draft = analysis.draft;
    } else {
      const kind: Draft["kind"] =
        move === "settle"
          ? "offer"
          : move === "refund"
            ? "refund"
            : kase.stage === "inquiry"
              ? "message"
              : "evidence";
      draft = {
        kind,
        text: words ?? plainDraftText(kase, order, move, offer, ctx.shop),
        evidenceIds: same && analysis ? analysis.draft.evidenceIds : [],
        ...(kind === "offer" ? { offerAmount: offer } : {}),
        ...(kind === "evidence"
          ? { evidenceType: order?.tracking ? "PROOF_OF_FULFILLMENT" : "OTHER" }
          : {}),
      };
    }
    const { money } = writer(ctx.shop);
    const amount = move === "settle" ? money(offer) : move === "refund" ? money(kase.amount) : "";
    const label =
      move === "fight"
        ? kase.stage === "inquiry"
          ? `Reply to ${kase.buyer.name}`
          : `Send PayPal the evidence for ${kase.buyer.name}`
        : `${ACTION_VERB[move]} ${kase.buyer.name} ${amount}`;
    const card: ChatCard = { kind: "action", caseId: kase.id, move, draft, label };
    return {
      content: {
        prepared: label,
        note: "The seller now sees an action card with this draft. Nothing is sent until they approve it.",
        draft: draft.text,
        truceRecommends: analysis
          ? {
              move: analysis.recommendation.move,
              headline: analysis.recommendation.headline,
              differs: !same,
            }
          : "This case hasn't been analyzed yet.",
      },
      label: `Ready for your approval: ${label}`,
      card,
    };
  },
};

export const CHAT_TOOLS = [
  listCases,
  getCase,
  getOrder,
  ordersAtRisk,
  claimsRatioTool,
  explainOutcome,
  similarCases,
  prepareAction,
] as const;
