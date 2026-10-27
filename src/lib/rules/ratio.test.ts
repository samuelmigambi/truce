import { describe, expect, it } from "vitest";
import { claimsRatio } from "./ratio";

describe("claimsRatio", () => {
  it("measures claims against sales", () => {
    expect(claimsRatio(400, 2).ratio).toBeCloseTo(0.005);
    expect(claimsRatio(0, 0).ratio).toBe(0);
  });

  it("crosses the line at 1.5% only with more than 100 sales", () => {
    expect(claimsRatio(200, 3).highVolume).toBe(true);
    expect(claimsRatio(200, 2).highVolume).toBe(false);
    expect(claimsRatio(100, 5).highVolume).toBe(false);
  });

  it("counts the claims left before the line", () => {
    expect(claimsRatio(200, 0).headroom).toBe(2);
    expect(claimsRatio(150, 1).headroom).toBe(1);
    expect(claimsRatio(200, 5).headroom).toBe(0);
  });
});
