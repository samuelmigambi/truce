import type { DisputeReason, DisputeStage, Move } from "../domain";
import type { Cents } from "../money";
import { disputeFee } from "./fees";

/** How strong the seller's evidence is: the agent's read of the case, checked against the records. */
export type Evidence = "strong" | "mixed" | "weak";

/** Planning figures for the chance of winning a claim, not PayPal's numbers. */
export const WIN_CHANCE: Record<Evidence, number> = { strong: 0.85, mixed: 0.5, weak: 0.15 };
export const PROTECTED_WIN_CHANCE = 0.95;

export interface MoveQuestion {
  amount: Cents;
  reason: DisputeReason;
  stage: DisputeStage;
  protectedSale: boolean;
  highVolume: boolean;
  evidence: Evidence;
  /** The partial refund to offer, for "settle". */
  offer?: Cents;
}

export interface MoveCost {
  move: Move;
  /** Offers can only be made while the dispute is still an inquiry. */
  available: boolean;
  /** Money the seller can expect to lose, fees included. */
  expected: Cents;
  /** Money lost if it goes badly. */
  worst: Cents;
  fee: Cents;
  /** The case ends up counting toward the shop's claims ratio. */
  countsAsClaim: boolean;
  note: string;
}

/** A partial refund to suggest: about a quarter of the order, to the nearest $5, at least $5. */
export function suggestOffer(amount: Cents): Cents {
  return Math.max(500, Math.round(amount / 4 / 500) * 500);
}

/** What each move would cost, from PayPal's fee rules and the evidence. Code computes; the agent explains. */
export function costMoves(q: MoveQuestion): MoveCost[] {
  const base = {
    amount: q.amount,
    reason: q.reason,
    protectedSale: q.protectedSale,
    highVolume: q.highVolume,
  };
  // A fight that isn't settled ends as a claim PayPal decides.
  const decided = q.stage === "inquiry" ? "claim" : q.stage;
  const chance = q.protectedSale ? PROTECTED_WIN_CHANCE : WIN_CHANCE[q.evidence];
  const loseFee = disputeFee({ ...base, stage: decided, ending: "seller_lost" }).amount;
  const winFee = disputeFee({ ...base, stage: decided, ending: "seller_won" }).amount;
  const fight: MoveCost = {
    move: "fight",
    available: true,
    expected: Math.round((1 - chance) * (q.amount + loseFee) + chance * winFee),
    worst: q.amount + loseFee,
    fee: loseFee,
    countsAsClaim: true,
    note: `About ${Math.round(chance * 100)}% to win`,
  };

  const canOffer = q.stage === "inquiry";
  const offer = q.offer ?? suggestOffer(q.amount);
  const settle: MoveCost = {
    move: "settle",
    available: canOffer && offer < q.amount,
    expected: offer,
    worst: offer,
    fee: 0,
    countsAsClaim: false,
    note: canOffer ? "No fee while it's an inquiry" : "Offers end when an inquiry becomes a claim",
  };

  const refundFee = disputeFee({
    ...base,
    stage: q.stage,
    ending: q.stage === "inquiry" ? "settled_with_buyer" : "seller_lost",
  });
  const refund: MoveCost = {
    move: "refund",
    available: true,
    expected: q.amount + refundFee.amount,
    worst: q.amount + refundFee.amount,
    fee: refundFee.amount,
    countsAsClaim: q.stage !== "inquiry",
    note: refundFee.amount === 0 ? "No fee" : refundFee.why,
  };

  return [fight, settle, refund];
}

/** The available move with the lowest expected cost; ties go to the earlier move in the list. */
export function cheapestMove(costs: MoveCost[]): MoveCost {
  const open = costs.filter((c) => c.available);
  if (open.length === 0) throw new Error("No move is available");
  return open.reduce((best, c) => (c.expected < best.expected ? c : best));
}
