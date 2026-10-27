import { describe, expect, it } from "vitest";
import { formatUsd, toCents, toPayPalValue } from "./money";

describe("money", () => {
  it("reads PayPal amounts into cents without drift", () => {
    expect(toCents("86.00")).toBe(8600);
    expect(toCents("0.29")).toBe(29);
    expect(toCents(42.5)).toBe(4250);
  });

  it("refuses things that aren't amounts", () => {
    expect(() => toCents("abc")).toThrow();
  });

  it("writes amounts the way PayPal takes them", () => {
    expect(toPayPalValue(1000)).toBe("10.00");
    expect(toPayPalValue(4250)).toBe("42.50");
  });

  it("shows whole dollars without cents", () => {
    expect(formatUsd(23800)).toBe("$238");
    expect(formatUsd(4250)).toBe("$42.50");
    expect(formatUsd(123400)).toBe("$1,234");
    expect(formatUsd(123456)).toBe("$1,234.56");
  });
});
