import { describe, expect, it } from "vitest";
import type { Analysis, Case } from "@/lib/domain";
import { buildSeed } from "./demo/seed";
import { computeMetrics, modelSpend, shopMetrics, shopRatio, weekStart } from "./metrics";
import { MemoryStore } from "./store/memory";

const DAY = 24 * 60 * 60 * 1000;
const created = "2026-10-28T15:20:00.000Z";
const now = Date.parse(created);
const seed = buildSeed(created);

function analysis(
  caseId: string,
  steps: [model: string, cost: number | null][],
  totalCost: number,
): Analysis {
  return {
    caseId,
    totalCost,
    steps: steps.map(([model, cost], i) => ({
      step: i === 0 ? "triage" : "decide",
      model,
      inputTokens: 1000,
      outputTokens: 100,
      cachedTokens: 0,
      cost,
      ms: 900,
    })),
  } as unknown as Analysis;
}

describe("computeMetrics on the demo seed", () => {
  const metrics = computeMetrics(seed.cases, seed.orders, [], now);

  it("adds up what's at risk and what's due this week", () => {
    expect(metrics.moneyAtRisk).toBe(8600 + 4200 + 12000 + 2800 + 6400);
    expect(metrics.openCases).toBe(5);
    expect(metrics.dueSoon).toBe(2);
  });

  it("counts kept money and fees over the last 30 days only", () => {
    // Isabel's $86 (closed by the buyer) and Kayla's settled $42, less the $10 offer.
    expect(metrics.kept).toBe(8600 + 3200);
    expect(metrics.feesAvoided).toBe(1500);
    expect(metrics.feesPaid).toBe(0);
  });

  it("measures the claims ratio over 90 days", () => {
    expect(metrics.ratio.claims).toBe(2);
    expect(metrics.ratio.ratio).toBeLessThan(0.015);
    expect(metrics.ratio.headroom).toBeGreaterThanOrEqual(1);
  });

  it("buckets 13 weeks of disputes by reason, oldest first, starting on Mondays", () => {
    expect(metrics.weekly).toHaveLength(13);
    expect(metrics.weekly.every((w) => new Date(w.weekStart).getUTCDay() === 1)).toBe(true);
    expect(metrics.weekly.at(-1)!.weekStart).toBe("2026-10-26T00:00:00.000Z");
    const total = metrics.weekly.reduce(
      (sum, w) => sum + w.not_received + w.not_as_described + w.unauthorized + w.other,
      0,
    );
    expect(total).toBe(15);
    expect(metrics.weekly.at(-1)).toMatchObject({
      not_received: 1,
      not_as_described: 2,
      unauthorized: 0,
    });
  });

  it("finds the size, delivery and breakage patterns in what buyers said", () => {
    const [size, delivered, broken] = metrics.patterns;
    expect(size!.text).toMatch(/smaller than expected.*Add measurements to the photos/);
    expect(size!.caseIds.sort()).toEqual([
      "demo-nad-42",
      "demo-size-amber-1",
      "demo-size-amber-2",
      "demo-size-fig",
    ]);
    expect(delivered!.caseIds.sort()).toEqual([
      "demo-inr-86",
      "demo-inr-late",
      "demo-inr-neighbor",
      "demo-inr-porch",
    ]);
    expect(delivered!.text).toMatch(/3 buyers closed the case/);
    expect(broken!.caseIds.sort()).toEqual(["demo-damaged-28", "demo-damaged-jar"]);
  });

  it("has no spend before any analysis", () => {
    expect(metrics.spend).toEqual([]);
    expect(metrics.averageCaseCost).toBeNull();
  });
});

describe("metric helpers", () => {
  it("starts weeks on Monday at midnight UTC", () => {
    expect(new Date(weekStart(Date.parse("2026-10-28T15:00:00Z"))).toISOString()).toBe(
      "2026-10-26T00:00:00.000Z",
    );
    expect(new Date(weekStart(Date.parse("2026-11-01T23:00:00Z"))).toISOString()).toBe(
      "2026-10-26T00:00:00.000Z",
    );
    expect(new Date(weekStart(Date.parse("2026-11-02T00:00:00Z"))).toISOString()).toBe(
      "2026-11-02T00:00:00.000Z",
    );
  });

  it("counts only claims and chargebacks opened in the last 90 days", () => {
    const base = seed.cases.find((c) => c.id === "demo-unauth-120")!;
    const cases: Case[] = [
      base,
      { ...base, id: "x1", stage: "inquiry" },
      { ...base, id: "x2", stage: "chargeback" },
      { ...base, id: "x3", openedAt: new Date(now - 91 * DAY).toISOString() },
    ];
    expect(shopRatio(seed.orders, cases, now).claims).toBe(2);
  });

  it("adds up model spend by model, and the average cost of a case", () => {
    const { spend, averageCaseCost } = modelSpend([
      analysis(
        "a",
        [
          ["nvidia/Nemotron-3_5-Lightning", 0.001],
          ["nvidia/Nemotron-3-Ultra-550b-a55b", 0.012],
        ],
        0.013,
      ),
      analysis(
        "b",
        [
          ["nvidia/Nemotron-3_5-Lightning", 0.002],
          ["unknown/model", null],
        ],
        0.002,
      ),
    ]);
    expect(spend).toEqual([
      { model: "nvidia/Nemotron-3-Ultra-550b-a55b", calls: 1, cost: 0.012 },
      { model: "nvidia/Nemotron-3_5-Lightning", calls: 2, cost: 0.003 },
      { model: "unknown/model", calls: 1, cost: 0 },
    ]);
    expect(averageCaseCost).toBe(0.0075);
  });

  it("reads saved analyses from the store", async () => {
    const store = new MemoryStore();
    for (const kase of seed.cases) await store.saveCase("w", kase);
    for (const order of seed.orders) await store.saveOrder("w", order);
    await store.saveAnalysis(
      "w",
      analysis("demo-inr-86", [["nvidia/Nemotron-3.5-Super-VL", 0.004]], 0.004),
    );
    const metrics = await shopMetrics(store, "w", now);
    expect(metrics.spend).toEqual([
      { model: "nvidia/Nemotron-3.5-Super-VL", calls: 1, cost: 0.004 },
    ]);
    expect(metrics.averageCaseCost).toBe(0.004);
    expect(metrics.openCases).toBe(5);
  });
});
