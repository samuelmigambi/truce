import { describe, expect, it } from "vitest";
import { addSpend, dailySpendCap, rateLimit, spendToday } from "./limits";
import { MemoryStore } from "./store/memory";

describe("limits", () => {
  it("allows calls up to the limit in a window, then refuses", async () => {
    let now = Date.parse("2026-10-28T10:00:00.000Z");
    const store = new MemoryStore(() => now);
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit("analyze:demo-1", 3, 3600, store));
    expect(results).toEqual([true, true, true, false]);
    expect(await rateLimit("analyze:demo-2", 3, 3600, store)).toBe(true);
    now += 3600_000;
    expect(await rateLimit("analyze:demo-1", 3, 3600, store)).toBe(true);
  });

  it("adds up today's spend without drifting, and starts again at midnight UTC", async () => {
    let now = Date.parse("2026-10-28T22:00:00.000Z");
    const store = new MemoryStore(() => now);
    for (let i = 0; i < 10; i++) await addSpend(0.1, store);
    expect(await spendToday(store)).toBe(1);
    expect(await addSpend(0.000123, store)).toBeCloseTo(1.000123, 9);
    expect(await addSpend(-5, store)).toBeCloseTo(1.000123, 9);
    now = Date.parse("2026-10-29T00:00:01.000Z");
    expect(await spendToday(store)).toBe(0);
  });

  it("caps daily spend at $5 unless TRUCE_DAILY_SPEND_CAP says otherwise", () => {
    expect(dailySpendCap({})).toBe(5);
    expect(dailySpendCap({ TRUCE_DAILY_SPEND_CAP: "12.5" })).toBe(12.5);
    expect(dailySpendCap({ TRUCE_DAILY_SPEND_CAP: "nonsense" })).toBe(5);
    expect(dailySpendCap({ TRUCE_DAILY_SPEND_CAP: "0" })).toBe(5);
  });
});
