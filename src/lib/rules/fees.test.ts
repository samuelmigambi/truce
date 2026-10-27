import { describe, expect, it } from "vitest";
import { disputeFee, type FeeQuestion } from "./fees";

const claim: FeeQuestion = {
  amount: 8600,
  reason: "not_as_described",
  stage: "claim",
  ending: "seller_lost",
  protectedSale: false,
  highVolume: false,
};

describe("disputeFee", () => {
  it("charges nothing for an inquiry settled before it becomes a claim", () => {
    expect(disputeFee({ ...claim, stage: "inquiry" }).amount).toBe(0);
    expect(disputeFee({ ...claim, stage: "inquiry", highVolume: true }).amount).toBe(0);
  });

  it("charges the standard $15 on a lost claim", () => {
    expect(disputeFee(claim)).toEqual({ amount: 1500, why: "Standard dispute fee" });
  });

  it("waives the standard fee when the seller wins", () => {
    expect(disputeFee({ ...claim, ending: "seller_won" }).amount).toBe(0);
  });

  it("waives the standard fee for Seller Protection, unauthorized and small claims", () => {
    expect(disputeFee({ ...claim, protectedSale: true }).amount).toBe(0);
    expect(disputeFee({ ...claim, reason: "unauthorized" }).amount).toBe(0);
    expect(disputeFee({ ...claim, amount: 2999 }).amount).toBe(0);
    expect(disputeFee({ ...claim, amount: 3000 }).amount).toBe(1500);
  });

  it("waives it when the seller and buyer settle", () => {
    expect(disputeFee({ ...claim, ending: "settled_with_buyer" }).amount).toBe(0);
  });

  it("charges $30 at high volume, even when the seller wins", () => {
    expect(disputeFee({ ...claim, highVolume: true, ending: "seller_won" }).amount).toBe(3000);
  });

  it("charges $20 for a card chargeback", () => {
    expect(disputeFee({ ...claim, stage: "chargeback", cardChargeback: true }).amount).toBe(2000);
  });
});
