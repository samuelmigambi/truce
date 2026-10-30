import type { DisputeReason, DisputeStage } from "../domain";
import type { Cents } from "../money";

/**
 * PayPal's US dispute fees: the merchant fees page (updated 1 Oct 2026) and the user agreement's
 * "Dispute fees" section. The figures live here only.
 */
export const DISPUTE_FEES = {
  standard: 1500,
  /** Once the claims ratio reaches 1.5% with more than 100 sales in three months. */
  highVolume: 3000,
  /** Card payments made outside a PayPal account. */
  cardChargeback: 2000,
  /** Claims below this aren't charged the standard fee. */
  smallClaimLimit: 3000,
} as const;

/** How a dispute ended, or would end. */
export type Ending = "settled_with_buyer" | "seller_won" | "seller_lost";

export interface FeeQuestion {
  amount: Cents;
  reason: DisputeReason;
  /** The stage the dispute ends at. */
  stage: DisputeStage;
  ending: Ending;
  /** The case meets Seller Protection. */
  protectedSale: boolean;
  /** The shop pays the high-volume fee (see claimsRatio). */
  highVolume: boolean;
  /** A card chargeback from outside a PayPal account. */
  cardChargeback?: boolean;
}

export interface Fee {
  amount: Cents;
  why: string;
}

/** The dispute fee PayPal charges the seller for one dispute, and why. */
export function disputeFee(q: FeeQuestion): Fee {
  if (q.stage === "inquiry") return { amount: 0, why: "Settled before it became a claim" };
  if (q.stage === "chargeback" && q.cardChargeback) {
    return { amount: DISPUTE_FEES.cardChargeback, why: "Card chargeback fee" };
  }
  if (q.highVolume) {
    return { amount: DISPUTE_FEES.highVolume, why: "High-volume fee, charged even when you win" };
  }
  if (q.ending === "settled_with_buyer")
    return { amount: 0, why: "Resolved directly with the buyer" };
  if (q.protectedSale) return { amount: 0, why: "Covered by Seller Protection" };
  if (q.reason === "unauthorized") return { amount: 0, why: "Unauthorized claims carry no fee" };
  if (q.amount < DISPUTE_FEES.smallClaimLimit)
    return { amount: 0, why: "Small claims carry no fee" };
  if (q.ending === "seller_won") return { amount: 0, why: "No fee when you win" };
  return { amount: DISPUTE_FEES.standard, why: "Standard dispute fee" };
}
