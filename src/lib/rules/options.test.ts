import { describe, expect, it } from "vitest";
import { cheapestMove, costMoves, suggestOffer } from "./options";

describe("suggestOffer", () => {
  it("offers about a quarter, to the nearest $5, at least $5", () => {
    expect(suggestOffer(4200)).toBe(1000);
    expect(suggestOffer(8600)).toBe(2000);
    expect(suggestOffer(1200)).toBe(500);
  });
});

describe("costMoves", () => {
  it("settles the $42 'smaller than the photos' inquiry for $10", () => {
    const costs = costMoves({
      amount: 4200,
      reason: "not_as_described",
      stage: "inquiry",
      protectedSale: false,
      highVolume: false,
      evidence: "mixed",
    });
    expect(costs.find((c) => c.move === "fight")?.expected).toBe(2850);
    expect(cheapestMove(costs)).toMatchObject({ move: "settle", expected: 1000, fee: 0 });
  });

  it("fights the $86 not-received inquiry that tracking shows delivered", () => {
    const costs = costMoves({
      amount: 8600,
      reason: "not_received",
      stage: "inquiry",
      protectedSale: true,
      highVolume: false,
      evidence: "strong",
    });
    expect(cheapestMove(costs)).toMatchObject({ move: "fight", expected: 430 });
  });

  it("takes offers off the table once it's a claim", () => {
    const costs = costMoves({
      amount: 12000,
      reason: "unauthorized",
      stage: "claim",
      protectedSale: true,
      highVolume: false,
      evidence: "strong",
    });
    expect(costs.find((c) => c.move === "settle")?.available).toBe(false);
    expect(cheapestMove(costs).move).toBe("fight");
  });

  it("makes refunding an inquiry cheaper than fighting on weak evidence, and keeps it off the ratio", () => {
    const costs = costMoves({
      amount: 3500,
      reason: "not_as_described",
      stage: "inquiry",
      protectedSale: false,
      highVolume: false,
      evidence: "weak",
    });
    const fight = costs.find((c) => c.move === "fight")!;
    const refund = costs.find((c) => c.move === "refund")!;
    expect(fight).toMatchObject({ expected: 4250, countsAsClaim: true });
    expect(refund).toMatchObject({ expected: 3500, fee: 0, countsAsClaim: false });
  });

  it("adds the high-volume fee to a refund once it's a claim", () => {
    const costs = costMoves({
      amount: 3500,
      reason: "not_as_described",
      stage: "claim",
      protectedSale: false,
      highVolume: true,
      evidence: "weak",
    });
    expect(costs.find((c) => c.move === "refund")).toMatchObject({ expected: 6500, fee: 3000 });
  });
});
