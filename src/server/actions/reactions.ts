import "server-only";

import type { Case, CaseEvent, CaseMessage, DisputeStage, Move, Shop } from "@/lib/domain";
import { formatMoney, type Cents } from "@/lib/money";
import { seedCaseId } from "@/server/demo/seed";
import { notify, type NewNotification } from "@/server/notifications";
import type { Store } from "@/server/store";
import { closeCase } from "./close";

/**
 * In a sample shop, buyers and PayPal answer the seller's approved step a few seconds later, so each
 * story reaches its end and the dashboard moves. The step waits on the case as `pendingReaction`
 * (what the seller did, never how it ends) and plays on the first read after it's due. Each answer
 * is on the case's timeline in the buyer's or PayPal's own words, and under the bell, as a real
 * shop's would be.
 */

export interface PendingReaction {
  id: string;
  dueAt: string;
  move: Move;
  /** The stage when the seller acted. */
  stage: DisputeStage;
  offerAmount?: Cents;
}

/** A case as stored: an approved step may be waiting for its reply. */
export type StoredCase = Case & { pendingReaction?: PendingReaction | null };

export type Script =
  | "buyer_closes"
  | "buyer_accepts_offer"
  | "buyer_escalates"
  | "paypal_rules_seller"
  | "paypal_rules_buyer"
  | "buyer_thanks";

const SECOND = 1000;
/** Buyers answer within seconds; PayPal takes two minutes to decide a claim. */
export const DELAYS: Record<Script, number> = {
  buyer_closes: 7 * SECOND,
  buyer_accepts_offer: 7 * SECOND,
  buyer_escalates: 9 * SECOND,
  paypal_rules_seller: 120 * SECOND,
  paypal_rules_buyer: 120 * SECOND,
  buyer_thanks: 6 * SECOND,
};

/** A buyer takes an offer of at least a fifth of the order; less, and they ask PayPal to step in. */
const FAIR_OFFER = 0.2;

/** How each seeded case answers a move: the story's ending for the expected move, a believable one otherwise. */
export function scriptFor(
  caseId: string,
  move: Move,
  stage: DisputeStage,
  amount: Cents,
  offer?: Cents,
): Script | null {
  const seed = seedCaseId(caseId);
  if (!seed) return null;
  if (move === "refund") return seed === "demo-unauth-120" ? null : "buyer_thanks";
  if (move === "settle")
    return (offer ?? 0) >= amount * FAIR_OFFER ? "buyer_accepts_offer" : "buyer_escalates";
  // Fighting works where the evidence is strong: delivered to the PayPal address, or shipped there.
  const strong = seed === "demo-inr-86" || seed === "demo-unauth-120";
  if (stage === "inquiry") return strong ? "buyer_closes" : "buyer_escalates";
  return strong ? "paypal_rules_seller" : "paypal_rules_buyer";
}

const firstName = (kase: Case) => kase.buyer.name.split(" ")[0] ?? kase.buyer.name;

/** What the buyer or PayPal says, in each seeded case's own voice where it matters. */
function lines(kase: Case, script: Script, offer: Cents, money: (c: Cents) => string): string[] {
  const seed = seedCaseId(kase.id);
  switch (script) {
    case "buyer_closes":
      return seed === "demo-inr-86"
        ? [
            "Found them! They were in the parcel locker in our building's mail room. I never got the pickup notice. So sorry for the trouble, I've closed the case.",
          ]
        : ["Found it, thank you for the tracking. I've closed the case."];
    case "buyer_accepts_offer":
      return seed === "demo-nad-42"
        ? ["That's fair, thank you. I'll keep the candle."]
        : [`Thanks, ${money(offer)} works for me.`];
    case "buyer_escalates":
      return [
        seed === "demo-damaged-28"
          ? "The mug arrived broken, and that doesn't put it right. I've asked PayPal to step in."
          : seed === "demo-nad-42"
            ? "It's half the size I expected, so I don't think that's fair. I've asked PayPal to step in."
            : "I don't think that's fair, so I've asked PayPal to step in.",
        "The buyer escalated this case to a claim. Respond with your evidence by the due date.",
      ];
    case "paypal_rules_seller":
      return [
        "We've decided this case in your favor. The order shipped to the address on the payment, and tracking confirms it was delivered.",
      ];
    case "paypal_rules_buyer":
      return [
        kase.reason === "not_received"
          ? "We've decided this case in the buyer's favor. Tracking doesn't show that the order was delivered."
          : "We've decided this case in the buyer's favor. The evidence shows the item wasn't as described.",
      ];
    case "buyer_thanks":
      return [
        seed === "demo-damaged-28"
          ? "Thank you, that was quick. I'll order another one."
          : seed === "demo-inr-64"
            ? "Thank you for refunding me so quickly."
            : "Thanks for the refund.",
      ];
  }
}

/** PayPal-style due date: the end of the tenth day, US Central time. */
function claimDue(now: Date): string {
  const day = 24 * 60 * 60 * 1000;
  const midnight = Math.floor(now.getTime() / day) * day;
  return new Date(midnight + 11 * day + (4 * 60 + 59) * 60_000 + 59_000).toISOString();
}

/** Plays one reaction: the reply, the events, and the case's new state. */
export async function playReaction(
  store: Store,
  shop: Shop,
  kase: StoredCase,
  now: Date,
): Promise<Case> {
  const money = (cents: Cents) => formatMoney(cents, shop.currency);
  const reaction = kase.pendingReaction;
  if (!reaction) return kase;
  const offer = reaction.offerAmount ?? 0;
  const script = scriptFor(kase.id, reaction.move, reaction.stage, kase.amount, offer);
  const at = reaction.dueAt;
  let next: Case = withoutReaction({ ...kase, updatedAt: at });
  if (!script) {
    await store.saveCase(shop.id, next);
    return next;
  }

  const said = lines(kase, script, offer, money);
  const speaker: CaseMessage["from"] = script.startsWith("paypal") ? "paypal" : "buyer";
  const messages: CaseMessage[] = said.map((text, i) => ({
    id: `${reaction.id}-m${i + 1}`,
    from: i === 0 ? speaker : "paypal",
    at,
    text,
  }));
  next = { ...next, messages: [...kase.messages, ...messages] };
  const name = kase.buyer.name;
  const words = said[0];
  const events: Omit<CaseEvent, "id">[] = [];
  let notice: Omit<NewNotification, "id" | "caseId" | "at"> | null = null;

  switch (script) {
    case "buyer_closes":
      events.push({
        at,
        kind: "buyer_reply",
        actor: "buyer",
        title: `${firstName(kase)} found the parcel`,
        detail: words,
      });
      next = await closeCase(store, shop, next, "buyer_closed", 0, new Date(at));
      events.push({ at, kind: "closed", actor: "buyer", title: `${name} closed the case` });
      notice = { kind: "buyer_reply", title: `${name} closed the case`, detail: words };
      break;
    case "buyer_accepts_offer":
      events.push({
        at,
        kind: "buyer_reply",
        actor: "buyer",
        title: `${name} accepted your ${money(offer)} offer`,
        detail: words,
      });
      notice = {
        kind: "buyer_reply",
        title: `${name} accepted your ${money(offer)} offer`,
        detail: words,
      };
      next = await closeCase(store, shop, next, "settled", offer, new Date(at));
      events.push({
        at,
        kind: "closed",
        actor: "paypal",
        title: `Closed: settled for ${money(offer)}`,
      });
      break;
    case "buyer_escalates":
      next = { ...next, stage: "claim", status: "needs_you", dueAt: claimDue(now) };
      await store.saveCase(shop.id, next);
      events.push({
        at,
        kind: "escalated",
        actor: "buyer",
        title: `${name} escalated it to a claim`,
        detail: words,
      });
      notice = { kind: "dispute_updated", title: `${name} escalated the dispute to a claim` };
      break;
    case "paypal_rules_seller":
      events.push({
        at,
        kind: "decided",
        actor: "paypal",
        title: "PayPal ruled in your favor",
        detail: words,
      });
      next = await closeCase(store, shop, next, "won", 0, new Date(at));
      notice = {
        kind: "decided",
        title: `PayPal ruled in your favor on ${name}'s case`,
        detail: `You kept ${money(next.moneyKept)}.`,
      };
      events.push({
        at,
        kind: "closed",
        actor: "paypal",
        title: `Closed: you kept ${money(next.moneyKept)}`,
      });
      break;
    case "paypal_rules_buyer": {
      events.push({
        at,
        kind: "decided",
        actor: "paypal",
        title: "PayPal ruled for the buyer",
        detail: words,
      });
      next = await closeCase(store, shop, next, "lost", kase.amount, new Date(at));
      notice = { kind: "decided", title: `PayPal ruled for the buyer on ${name}'s case` };
      const fee = next.feeCharged > 0 ? `, plus a ${money(next.feeCharged)} dispute fee` : "";
      events.push({
        at,
        kind: "closed",
        actor: "paypal",
        title: `Closed: ${money(kase.amount)} refunded to the buyer${fee}`,
      });
      break;
    }
    case "buyer_thanks":
      await store.saveCase(shop.id, next);
      events.push({
        at,
        kind: "buyer_reply",
        actor: "buyer",
        title: `${firstName(kase)} replied`,
        detail: words,
      });
      notice = { kind: "buyer_reply", title: `${name} replied`, detail: words };
      break;
  }
  await Promise.all(
    events.map((event, i) =>
      store.addEvent(shop.id, kase.id, { id: `${reaction.id}-e${i + 1}`, ...event }),
    ),
  );
  if (notice) {
    await notify(store, shop.id, { ...notice, id: `reaction:${reaction.id}`, caseId: kase.id, at });
  }
  return next;
}

/** Whether any of these cases has a reply waiting whose time has come. */
export function hasDueReaction(cases: Case[], now: Date): boolean {
  return cases.some((kase) => {
    const reaction = (kase as StoredCase).pendingReaction;
    return Boolean(reaction && Date.parse(reaction.dueAt) <= now.getTime());
  });
}

/** Plays every reaction that's due among these cases; returns the cases as they now stand. */
export async function playDueReactions(
  store: Store,
  shop: Shop,
  cases: Case[],
  now = new Date(),
): Promise<Case[]> {
  return Promise.all(
    cases.map((kase) => {
      const reaction = (kase as StoredCase).pendingReaction;
      if (!reaction || Date.parse(reaction.dueAt) > now.getTime()) return kase;
      return playReaction(store, shop, kase as StoredCase, now);
    }),
  );
}

/** A copy of the case with no step waiting. */
export function withoutReaction(kase: StoredCase): Case {
  const copy: StoredCase = { ...kase };
  delete copy.pendingReaction;
  return copy;
}
