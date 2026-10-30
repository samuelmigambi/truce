import { describe, expect, it } from "vitest";
import { EMPTY_POLICIES } from "@/lib/shop-options";
import { checkPolicies, checkProfile, fieldId, fieldsUnder, shortKey, without } from "./fields";

describe("fieldId", () => {
  it("turns a field's path into an id", () => {
    expect(fieldId("shop", "website")).toBe("shop-website");
    expect(fieldId("policy", "returns.url")).toBe("policy-returns-url");
  });
});

describe("fieldsUnder", () => {
  it("keeps one part's errors, without its prefix", () => {
    expect(
      fieldsUnder({ "profile.website": "Bad", "policies.shipping.url": "Bad too" }, "policies"),
    ).toEqual({ "shipping.url": "Bad too" });
  });
});

describe("checkProfile", () => {
  it("returns what to send, with the address made whole", () => {
    const result = checkProfile({
      name: "Wick & Ember",
      website: "wickandember.com",
      currency: "USD",
      timeZone: "America/Los_Angeles",
      sells: "Hand-poured candles",
    });
    expect(result).toEqual({
      ok: true,
      profile: {
        name: "Wick & Ember",
        website: "https://wickandember.com",
        currency: "USD",
        timeZone: "America/Los_Angeles",
        sells: "Hand-poured candles",
      },
    });
  });

  it("says what's wrong with each field", () => {
    const result = checkProfile({
      name: "",
      website: "not a site",
      currency: "USD",
      timeZone: "Mars/Olympus",
      sells: "",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["name", "sells", "timeZone", "website"]);
  });
});

describe("checkPolicies", () => {
  it("accepts empty policies, since they're optional", () => {
    expect(checkPolicies(EMPTY_POLICIES).ok).toBe(true);
  });

  it("keys errors by the field's path", () => {
    const result = checkPolicies({
      shipping: { text: "", url: "not a site" },
      returns: { text: "", url: null },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toEqual(["shipping.url"]);
  });
});

describe("small helpers", () => {
  it("shortens a long key but leaves a short one", () => {
    expect(shortKey("AbC4defghijklmnopqrstuvwxyz0123x9Z")).toBe("AbC4…x9Z");
    expect(shortKey("short")).toBe("short");
  });

  it("drops one field's error and keeps the same object when there's none", () => {
    const errors = { name: "Enter a name.", sells: "Say what you sell." };
    expect(without(errors, "name")).toEqual({ sells: "Say what you sell." });
    expect(without(errors, "website")).toBe(errors);
  });
});
