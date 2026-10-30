import "server-only";

import type {
  Case,
  CaseOutcome,
  DisputeReason,
  DisputeStage,
  Order,
  OrderStatus,
  Shop,
} from "@/lib/domain";
import type { Cents } from "@/lib/money";
import { disputeFee, type Ending } from "@/lib/rules/fees";
import { caseProtection } from "@/lib/rules/protection";
import { shopRatio } from "@/server/metrics";
import type { Store } from "@/server/store";

/**
 * Closing a case: what the seller kept, what PayPal charged in fees, and the fee they avoided, all
 * from the fee rules (disputeFee), never guessed.
 */

export interface Closing {
  amount: Cents;
  reason: DisputeReason;
  /** The stage the dispute ended at. */
  stage: DisputeStage;
  outcome: CaseOutcome;
  /** Money that went back to the buyer. */
  refunded: Cents;
  protectedSale: boolean;
  highVolume: boolean;
}

export interface ClosingFigures {
  moneyKept: Cents;
  feeCharged: Cents;
  /** The fee a lost claim would have cost, less what was charged. */
  feeAvoided: Cents;
}

/** How each outcome ends, in the fee rules' terms. */
export function endingOf(outcome: CaseOutcome, stage: DisputeStage): Ending {
  switch (outcome) {
    case "won":
    case "buyer_closed":
      return "seller_won";
    case "settled":
      return "settled_with_buyer";
    case "refunded":
      return stage === "inquiry" ? "settled_with_buyer" : "seller_lost";
    case "lost":
      return "seller_lost";
  }
}

export function closingFigures(c: Closing): ClosingFigures {
  const base = {
    amount: c.amount,
    reason: c.reason,
    protectedSale: c.protectedSale,
    highVolume: c.highVolume,
  };
  const charged = disputeFee({ ...base, stage: c.stage, ending: endingOf(c.outcome, c.stage) });
  // Had it escalated and gone against the seller: an inquiry becomes a claim.
  const lost = disputeFee({
    ...base,
    stage: c.stage === "inquiry" ? "claim" : c.stage,
    ending: "seller_lost",
  });
  return {
    moneyKept: Math.max(0, c.amount - c.refunded),
    feeCharged: charged.amount,
    feeAvoided: Math.max(0, lost.amount - charged.amount),
  };
}

/** The order's status once money has gone back to the buyer. */
export function refundedStatus(order: Order, refunded: Cents): OrderStatus {
  if (refunded <= 0) return order.status;
  return refunded >= order.amount ? "refunded" : "partially_refunded";
}

/**
 * Closes a case for good: fills in the outcome and the money, and marks the order refunded when
 * money went back. Returns the closed case; the caller records the events.
 */
export async function closeCase(
  store: Store,
  shop: Shop,
  kase: Case,
  outcome: CaseOutcome,
  refunded: Cents,
  at: Date,
): Promise<Case> {
  const [order, orders, cases] = await Promise.all([
    store.getOrder(shop.id, kase.orderId),
    store.listOrders(shop.id),
    store.listCases(shop.id),
  ]);
  const protectedSale = order ? caseProtection(kase.reason, order).covered : false;
  // Without the shop's sales there's no ratio, so the high-volume fee isn't assumed.
  const { highVolume } = shopRatio(orders, cases, at.getTime(), shop.orderHistory === "full");
  const figures = closingFigures({
    amount: kase.amount,
    reason: kase.reason,
    stage: kase.stage,
    outcome,
    refunded,
    protectedSale,
    highVolume,
  });
  const closed: Case = {
    ...kase,
    ...figures,
    status: "closed",
    outcome,
    closedAt: at.toISOString(),
    updatedAt: at.toISOString(),
  };
  await store.saveCase(shop.id, closed);
  if (order && refunded > 0) {
    await store.saveOrder(shop.id, { ...order, status: refundedStatus(order, refunded) });
  }
  return closed;
}
