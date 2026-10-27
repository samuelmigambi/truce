import { describe, expect, it } from "vitest";
import type { Address, OrderFacts } from "../domain";
import { caseProtection, sameAddress, shippingChecks } from "./protection";

const home: Address = {
  line1: "18 Linden Street",
  line2: "Apartment 4",
  city: "Portland",
  state: "OR",
  postalCode: "97205",
  country: "US",
};

const delivered: OrderFacts = {
  amount: 8600,
  protection: "ELIGIBLE",
  paypalAddress: home,
  shipTo: { ...home, line1: "18 linden st.", line2: "apt 4", postalCode: "97205-1234" },
  tracking: {
    carrier: "USPS",
    number: "9400100000000000000000",
    uploaded: true,
    deliveredAt: "2026-10-24T15:02:00Z",
    signedFor: false,
  },
};

describe("sameAddress", () => {
  it("ignores case, punctuation, abbreviations and ZIP+4", () => {
    expect(sameAddress(home, delivered.shipTo!)).toBe(true);
  });

  it("spots a different street", () => {
    expect(sameAddress(home, { ...home, line1: "81 Linden Street" })).toBe(false);
  });
});

describe("shippingChecks", () => {
  it("passes an eligible order going to PayPal's address", () => {
    expect(shippingChecks(delivered).covered).toBe(true);
  });

  it("flags a label going somewhere else", () => {
    const result = shippingChecks({ ...delivered, shipTo: { ...home, city: "Salem" } });
    expect(result.covered).toBe(false);
    expect(result.checks.find((c) => c.id === "address")?.ok).toBe(false);
  });
});

describe("caseProtection", () => {
  it("covers item-not-received with delivery proof", () => {
    expect(caseProtection("not_received", delivered).covered).toBe(true);
  });

  it("never covers not-as-described", () => {
    const result = caseProtection("not_as_described", delivered);
    expect(result.covered).toBe(false);
    expect(result.checks[0]).toMatchObject({ id: "reason", ok: false });
  });

  it("needs delivery for item-not-received but only shipment for unauthorized", () => {
    const inTransit = { ...delivered, tracking: { ...delivered.tracking!, deliveredAt: null } };
    expect(caseProtection("not_received", inTransit).covered).toBe(false);
    expect(caseProtection("unauthorized", inTransit).covered).toBe(true);
  });

  it("limits partial eligibility to item-not-received", () => {
    const partial = { ...delivered, protection: "PARTIALLY_ELIGIBLE" as const };
    expect(caseProtection("not_received", partial).covered).toBe(true);
    expect(caseProtection("unauthorized", partial).covered).toBe(false);
  });
});
