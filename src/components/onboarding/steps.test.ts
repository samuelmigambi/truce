import { describe, expect, it } from "vitest";
import type { Shop } from "@/lib/domain";
import { furthestStep, resumeHref, shopReached, summaryOf, withShop } from "./steps";

const shop = (setupStep: Shop["setupStep"]): Shop =>
  ({
    id: "sh_1",
    name: "Wick & Ember",
    kind: "real",
    status: "setup",
    setupStep,
    paypal: null,
  }) as Shop;

describe("furthestStep", () => {
  it("asks for the shop first, then resumes the shop's own step", () => {
    expect(furthestStep(null)).toBe("details");
    expect(furthestStep(shop("policies"))).toBe("policies");
  });
});

describe("shopReached", () => {
  it("is true at or past the step, never before it", () => {
    expect(shopReached(shop("paypal"), "paypal")).toBe(true);
    expect(shopReached(shop("review"), "paypal")).toBe(true);
    expect(shopReached(shop("details"), "paypal")).toBe(false);
  });
});

describe("the shop list", () => {
  it("adds a new shop and updates a known one in place", () => {
    const first = summaryOf(shop("details"), "owner");
    const list = withShop([], first);
    expect(list).toHaveLength(1);
    const moved = withShop(list, { ...first, setupStep: "paypal" });
    expect(moved).toHaveLength(1);
    expect(moved[0]?.setupStep).toBe("paypal");
  });
});

describe("resumeHref", () => {
  it("names the shop in the address, encoded", () => {
    expect(resumeHref("sh_a/b")).toBe("/onboarding?shop=sh_a%2Fb");
  });
});
