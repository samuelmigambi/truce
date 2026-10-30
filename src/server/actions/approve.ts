import "server-only";

import { randomUUID } from "node:crypto";
import type { ApproveRequest, ApproveResponse } from "@/lib/api-types";
import type { Analysis, Case, CaseEvent, CaseStatus, Move, Order, Shop } from "@/lib/domain";
import { formatMoney, toPayPalValue, type Cents } from "@/lib/money";
import { log } from "@/server/log";
import { PayPalError, type PayPal } from "@/server/paypal/client";
import type { PayPalExtras } from "@/server/paypal/extras";
import { stageOf } from "@/server/paypal/map";
import type * as P from "@/server/paypal/types";
import type { Store } from "@/server/store";
import { closeCase } from "./close";
import { ActionError } from "./errors";
import { evidencePdf, type PdfSection } from "./evidence-pdf";
import { DELAYS, scriptFor, withoutReaction, type StoredCase } from "./reactions";

/**
 * Approving a step. The seller has read the draft and tapped approve; this sends it.
 * - Fight, inquiry: send-message with the draft.
 * - Fight, claim waiting for the seller: provide-evidence (proof of fulfillment, tracking, notes, a PDF).
 * - Fight, claim under review: provide-supporting-info.
 * - Settle (inquiry only): make-offer, a REFUND for the offer amount.
 * - Refund: accept-claim, a REFUND.
 * In a real shop each call goes to the shop's own PayPal app, checked first against the dispute's
 * own links. In a sample shop it's recorded as simulated, and the scripted reply is scheduled.
 */

export type PayPalAction =
  "send_message" | "make_offer" | "provide_evidence" | "provide_supporting_info" | "accept_claim";

const PATH: Record<PayPalAction, string> = {
  send_message: "send-message",
  make_offer: "make-offer",
  provide_evidence: "provide-evidence",
  provide_supporting_info: "provide-supporting-info",
  accept_claim: "accept-claim",
};

const DOING: Record<PayPalAction, string> = {
  send_message: "sending a message",
  make_offer: "making an offer",
  provide_evidence: "sending evidence",
  provide_supporting_info: "adding supporting information",
  accept_claim: "accepting the claim",
};

/** Where the case sits once the step is sent. */
const AFTER: Record<PayPalAction, CaseStatus> = {
  send_message: "waiting_buyer",
  make_offer: "waiting_buyer",
  provide_evidence: "with_paypal",
  provide_supporting_info: "with_paypal",
  accept_claim: "closed",
};

export function endpointFor(action: PayPalAction, disputeId: string): string {
  return `POST /v1/customer/disputes/${disputeId}/${PATH[action]}`;
}

/** The PayPal call a move makes at the case's stage. */
export function plannedAction(kase: Case, move: Move): PayPalAction {
  if (move === "refund") return "accept_claim";
  if (move === "settle") {
    if (kase.stage !== "inquiry") {
      throw new ActionError(
        409,
        "Offers can only be made while it's an inquiry. It's a claim now, so fight it or refund.",
      );
    }
    return "make_offer";
  }
  if (kase.stage === "inquiry") return "send_message";
  return kase.status === "with_paypal" ? "provide_supporting_info" : "provide_evidence";
}

/** The actions a live dispute allows, from the rel names of its links. */
export function allowedActions(dispute: P.Dispute): Set<string> {
  return new Set((dispute.links ?? []).map((l) => l.rel.toLowerCase().replace(/-/g, "_")));
}

function allows(options: unknown, path: [string, string], value: string): boolean {
  const list = (options as Record<string, Record<string, unknown> | undefined> | undefined)?.[
    path[0]
  ]?.[path[1]];
  return !Array.isArray(list) || list.includes(value);
}

/** For a real shop: the move's call, if the dispute's links say PayPal allows it now. */
export function liveAction(dispute: P.Dispute, move: Move): PayPalAction {
  const allowed = allowedActions(dispute);
  const inquiry = stageOf(dispute) === "inquiry";
  const wanted: PayPalAction[] =
    move === "refund"
      ? ["accept_claim"]
      : move === "settle"
        ? ["make_offer"]
        : inquiry
          ? ["send_message"]
          : ["provide_evidence", "provide_supporting_info"];
  const found = wanted.find((a) => allowed.has(a));
  const options = dispute.allowed_response_options;
  if (found === "make_offer" && !allows(options, ["make_offer", "offer_types"], "REFUND")) {
    throw new ActionError(409, "PayPal doesn't allow a partial refund offer on this dispute.");
  }
  if (
    found === "accept_claim" &&
    !allows(options, ["accept_claim", "accept_claim_types"], "REFUND")
  ) {
    throw new ActionError(409, "PayPal doesn't allow accepting this claim with a refund.");
  }
  if (found) return found;
  const open = (Object.keys(PATH) as PayPalAction[])
    .filter((a) => allowed.has(a))
    .map((a) => DOING[a]);
  const offerNote =
    move === "settle" && !inquiry ? " Offers are only possible while it's an inquiry." : "";
  const allowedNote = open.length
    ? ` It allows ${listOf(open)}.`
    : " It isn't taking any action from the seller right now.";
  throw new ActionError(
    409,
    `PayPal doesn't allow ${DOING[wanted[0]!]} on this dispute right now.${offerNote}${allowedNote}`,
  );
}

const listOf = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;

/** A PayPal refusal, as a message the seller can act on. Nothing is sent when this is thrown. */
export function refusal(error: unknown, doing: string): ActionError {
  if (!(error instanceof PayPalError)) {
    log.warn("approve.paypal_unreachable", { error });
    return new ActionError(
      502,
      "Couldn't reach PayPal, so nothing was sent. Try again in a moment.",
    );
  }
  const details = Array.isArray(error.details) ? (error.details as { issue?: string }[]) : [];
  const issue = details[0]?.issue ?? error.issue;
  const debug = error.debugId ? ` PayPal debug ID ${error.debugId}.` : "";
  if (issue === "ACTION_NOT_ALLOWED_IN_CURRENT_DISPUTE_STATE") {
    return new ActionError(
      409,
      `PayPal doesn't allow ${doing} in the dispute's current state. Refresh to see where it stands.${debug}`,
    );
  }
  if (error.status === 401 || error.status === 403) {
    return new ActionError(
      502,
      `PayPal turned the request away (${issue}). Check the app's dispute permissions.${debug}`,
    );
  }
  if (error.status === 400 || error.status === 422) {
    return new ActionError(422, `PayPal refused ${doing}: ${error.message} (${issue}).${debug}`);
  }
  return new ActionError(
    502,
    `PayPal didn't answer as expected (${error.status}), so nothing was sent.${debug}`,
  );
}

export interface ApproveInput {
  store: Store;
  shop: Shop;
  caseId: string;
  request: ApproveRequest;
  paypal?: PayPal | null;
  extras?: PayPalExtras | null;
  now?: Date;
}

export async function approveCase(input: ApproveInput): Promise<ApproveResponse> {
  const { store, shop, caseId, request } = input;
  const now = input.now ?? new Date();
  const kase = (await store.getCase(shop.id, caseId)) as StoredCase | null;
  if (!kase) {
    throw new ActionError(404, "There's no case with that ID in this shop.", {
      code: "case_not_found",
    });
  }
  if (kase.status === "closed") throw new ActionError(409, "This case is already closed.");
  if (kase.pendingReaction) {
    throw new ActionError(409, "Your last step was sent. The reply should arrive in a moment.");
  }
  const money = (cents: Cents) => formatMoney(cents, shop.currency);
  const offer =
    request.move === "settle" ? checkOffer(kase, request.draft.offerAmount, money) : undefined;
  const simulated = shop.kind === "sample";
  if (!simulated && (!shop.paypal || !input.paypal)) {
    throw new ActionError(409, "Connect this shop's PayPal in settings first. Nothing was sent.", {
      code: "paypal_not_connected",
    });
  }
  // One approval per case at a time, even across server instances: a double tap sends once.
  const lock = `approve:${shop.id}:${caseId}`;
  if ((await store.increment(lock, 1, 20)) > 1) {
    throw new ActionError(409, "This step is already being sent.");
  }

  const order = await store.getOrder(shop.id, kase.orderId);
  let action: PayPalAction;
  try {
    action = simulated
      ? plannedAction(kase, request.move)
      : await sendLive(input, kase, order, offer);
  } catch (error) {
    // Nothing was sent, so the seller can fix the draft and try again straight away.
    await store.increment(lock, -1, 20);
    throw error;
  }
  const endpoint = endpointFor(action, kase.paypalDisputeId);

  const events = stepEvents(kase, action, offer, simulated, now, money);
  const text = request.draft.text.trim();
  const toBuyer = action === "send_message" || action === "make_offer" || action === "accept_claim";
  let next: StoredCase = {
    ...withoutReaction(kase),
    status: AFTER[action],
    messages: toBuyer
      ? [
          ...kase.messages,
          { id: `${events[0]!.id}-m`, from: "seller", at: now.toISOString(), text },
        ]
      : kase.messages,
    updatedAt: now.toISOString(),
  };
  if (action === "accept_claim") {
    next = await closeCase(store, shop, next, "refunded", kase.amount, now);
  }
  if (simulated) {
    const script = scriptFor(kase.id, request.move, kase.stage, kase.amount, offer);
    if (script) {
      next.pendingReaction = {
        id: `r-${events[0]!.id}`,
        dueAt: new Date(now.getTime() + DELAYS[script]).toISOString(),
        move: request.move,
        stage: kase.stage,
        ...(offer !== undefined ? { offerAmount: offer } : {}),
      };
    }
  }
  await Promise.all([
    store.saveCase(shop.id, next),
    ...events.map((event) => store.addEvent(shop.id, kase.id, event)),
  ]);
  log.info("approve.sent", { shopId: shop.id, caseId: kase.id, action, simulated });

  return {
    case: next,
    events: await store.listEvents(shop.id, kase.id),
    simulated,
    paypal: { endpoint, status: 200 },
  };
}

/** An offer must be a real partial refund: more than nothing, less than the order. */
function checkOffer(kase: Case, offer: number | undefined, money: (c: Cents) => string): number {
  if (!offer || !Number.isInteger(offer) || offer <= 0) {
    throw new ActionError(400, "An offer needs an amount in cents, such as 1000 for $10.");
  }
  if (offer >= kase.amount) {
    throw new ActionError(
      400,
      `An offer has to be less than the ${money(kase.amount)} the buyer paid. To give it all back, refund instead.`,
    );
  }
  return offer;
}

/** Makes the live call. Throws a clear ActionError, having sent nothing, when PayPal refuses. */
async function sendLive(
  input: ApproveInput,
  kase: Case,
  order: Order | null,
  offer: number | undefined,
) {
  const { paypal, extras, request, store, shop } = input;
  if (!paypal)
    throw new ActionError(409, "This shop isn't connected to PayPal, so nothing was sent.");
  const id = kase.paypalDisputeId;
  let dispute: P.Dispute;
  try {
    dispute = await paypal.getDispute(id);
  } catch (error) {
    throw refusal(error, "reading the dispute");
  }
  const action = liveAction(dispute, request.move);
  const text = request.draft.text.trim();
  try {
    switch (action) {
      case "send_message":
        await paypal.sendMessage(id, text);
        break;
      case "make_offer":
        await paypal.makeOffer(id, {
          note: text,
          offer_type: "REFUND",
          // The offer is in the dispute's own currency.
          offer_amount: {
            currency_code: dispute.dispute_amount?.currency_code ?? shop.currency,
            value: toPayPalValue(offer!),
          },
        });
        break;
      case "provide_evidence": {
        const analysis = await store.getAnalysis(shop.id, kase.id);
        await paypal.provideEvidence(id, { evidences: [evidenceFor(order, request)] }, [
          {
            name: `evidence-${id}.pdf`,
            type: "application/pdf",
            bytes: evidencePdf(
              `Evidence for PayPal dispute ${id}`,
              evidenceSections(shop, kase, order, text, analysis, request),
            ),
          },
        ]);
        break;
      }
      case "provide_supporting_info":
        if (!extras)
          throw new ActionError(409, "This shop isn't connected to PayPal, so nothing was sent.");
        await extras.provideSupportingInfo(id, text);
        break;
      case "accept_claim":
        await paypal.acceptClaim(id, { note: text, accept_claim_type: "REFUND" });
        break;
    }
  } catch (error) {
    if (error instanceof ActionError) throw error;
    throw refusal(error, DOING[action]);
  }
  return action;
}

const CARRIERS = new Set(["USPS", "UPS", "FEDEX", "DHL"]);

/** PROOF_OF_FULFILLMENT with the order's tracking, or OTHER when there's no tracking to give. */
export function evidenceFor(order: Order | null, request: ApproveRequest): P.Evidence {
  const tracking = order?.tracking;
  const notes = request.draft.text.trim().slice(0, 2000);
  if (!tracking) return { evidence_type: request.draft.evidenceType ?? "OTHER", notes };
  const carrier = tracking.carrier.toUpperCase();
  return {
    evidence_type: request.draft.evidenceType ?? "PROOF_OF_FULFILLMENT",
    evidence_info: {
      tracking_info: [
        CARRIERS.has(carrier)
          ? { carrier_name: carrier, tracking_number: tracking.number }
          : {
              carrier_name: "OTHER",
              carrier_name_other: tracking.carrier,
              tracking_number: tracking.number,
            },
      ],
    },
    notes,
  };
}

/** "Oct 27, 2026, 10:45 AM (America/Los_Angeles)": in the shop's own zone, named. */
const whenIn = (timeZone: string) => (iso: string) =>
  `${new Date(iso).toLocaleString("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" })} (${timeZone})`;

const line = (a: Order["shipTo"]) =>
  a
    ? [a.line1, a.line2, `${a.city}, ${a.state} ${a.postalCode}`, a.country]
        .filter(Boolean)
        .join(", ")
    : "None on file";

/** The PDF's pages: what was ordered and paid, where it went, every scan, and the statement. */
export function evidenceSections(
  shop: Shop,
  kase: Case,
  order: Order | null,
  statement: string,
  analysis: Analysis | null,
  request: ApproveRequest,
): PdfSection[] {
  const when = whenIn(shop.timeZone);
  const money = (cents: Cents) => formatMoney(cents, shop.currency);
  const sections: PdfSection[] = [
    {
      heading: "The shop",
      lines: [shop.website ? `${shop.name}, ${shop.website}` : shop.name],
    },
  ];
  if (order) {
    sections.push({
      heading: "The order and the payment",
      lines: [
        `Order ${order.id}, placed ${when(order.placedAt)}, for ${money(order.amount)}.`,
        ...order.items.map((i) => `${i.quantity} x ${i.name}, ${money(i.unitPrice)} each`),
        `Paid with PayPal${order.captureId ? `, capture ${order.captureId}` : ""}. Seller Protection: ${order.protection ?? "not reported"}.`,
        `Buyer: ${order.buyer.name}${order.buyer.email ? `, ${order.buyer.email}` : ""}.`,
      ],
    });
    const tracking = order.tracking;
    sections.push({
      heading: "Shipping",
      lines: tracking
        ? [
            `Shipped by ${tracking.carrier}, tracking number ${tracking.number}.`,
            `Shipped to: ${line(order.shipTo)}.`,
            `The address on the PayPal payment: ${line(order.paypalAddress)}.`,
            tracking.deliveredAt
              ? `Delivered ${when(tracking.deliveredAt)}.`
              : "No delivery scan yet.",
            ...(tracking.events ?? []).map(
              (e) => `${when(e.at)}: ${e.detail}${e.location ? `, ${e.location}` : ""}`,
            ),
          ]
        : ["No tracking on this order."],
    });
  }
  sections.push({ heading: "The seller's statement", lines: [statement] });
  const cited = analysis?.evidence.filter((e) => request.draft.evidenceIds.includes(e.id)) ?? [];
  if (cited.length) {
    sections.push({
      heading: "The records the statement cites",
      lines: cited.map((e) => `${e.id}, ${e.title}: ${e.summary} (${e.source})`),
    });
  }
  sections.push({
    heading: "Dispute",
    lines: [`PayPal dispute ${kase.paypalDisputeId}, opened ${when(kase.openedAt)}.`],
  });
  return sections;
}

/** The two events every approval records: the seller's approval, then the send. */
function stepEvents(
  kase: Case,
  action: PayPalAction,
  offer: number | undefined,
  simulated: boolean,
  now: Date,
  money: (cents: Cents) => string,
): CaseEvent[] {
  const name = kase.buyer.name;
  const amount = money(kase.amount);
  const approved: Record<PayPalAction, string> = {
    send_message: `You approved the reply to ${name}`,
    make_offer: `You approved a ${money(offer ?? 0)} partial refund offer`,
    provide_evidence: "You approved sending the evidence to PayPal",
    provide_supporting_info: "You approved sending more information to PayPal",
    accept_claim: `You approved a full refund of ${amount}`,
  };
  const sent: Record<PayPalAction, string> = {
    send_message: `Reply sent to ${name}`,
    make_offer: `${money(offer ?? 0)} offer sent to ${name}`,
    provide_evidence: "Evidence sent to PayPal: proof of fulfillment, with the tracking",
    provide_supporting_info: "Supporting information sent to PayPal",
    accept_claim: `Claim accepted: ${amount} refunded to ${name}`,
  };
  const stamp = `${now.getTime().toString(36)}-${randomUUID().slice(0, 6)}`;
  const at = now.toISOString();
  return [
    { id: `ev-${stamp}-approved`, at, kind: "approved", actor: "seller", title: approved[action] },
    {
      id: `ev-${stamp}-sent`,
      at,
      kind: "sent",
      actor: "truce",
      title: sent[action],
      ...(simulated ? { detail: "Simulated in this sample shop", simulated: true } : {}),
    },
  ];
}
