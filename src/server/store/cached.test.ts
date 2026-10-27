import { describe, expect, it, vi } from "vitest";
import type { Case, Order } from "@/lib/domain";
import { buildSeed } from "@/server/demo/seed";
import { CachedStore } from "./cached";
import { MemoryStore } from "./memory";

const seed = buildSeed("2026-10-28T15:20:00.000Z");

async function setup() {
  const clock = { now: 1_000_000 };
  const inner = new MemoryStore();
  for (const order of seed.orders) await inner.saveOrder("w", order);
  for (const kase of seed.cases) await inner.saveCase("w", kase);
  const listOrders = vi.spyOn(inner, "listOrders");
  const getOrder = vi.spyOn(inner, "getOrder");
  const store = new CachedStore(inner, 4_000, () => clock.now);
  return { inner, store, clock, listOrders, getOrder };
}

describe("the read cache", () => {
  it("shares one fetch between reads that arrive together", async () => {
    const { store, listOrders } = await setup();
    const [a, b, c] = await Promise.all([
      store.listOrders("w"),
      store.listOrders("w"),
      store.listOrders("w"),
    ]);
    expect(listOrders).toHaveBeenCalledTimes(1);
    expect(a).toHaveLength(seed.orders.length);
    expect(b).toEqual(a);
    expect(c).not.toBe(a);
  });

  it("serves single records from a cached list", async () => {
    const { store, listOrders, getOrder } = await setup();
    await store.listOrders("w");
    expect((await store.getOrder("w", "W-1101"))?.id).toBe("W-1101");
    expect(await store.getOrder("w", "W-0")).toBeNull();
    expect(getOrder).not.toHaveBeenCalled();
    expect(listOrders).toHaveBeenCalledTimes(1);
  });

  it("reads again after a few seconds", async () => {
    const { store, clock, listOrders } = await setup();
    await store.listOrders("w");
    clock.now += 3_000;
    await store.listOrders("w");
    expect(listOrders).toHaveBeenCalledTimes(1);
    clock.now += 2_000;
    await store.listOrders("w");
    expect(listOrders).toHaveBeenCalledTimes(2);
  });

  it("forgets a workspace's reads on any write to it, and counts the writes", async () => {
    const { store } = await setup();
    const before = await store.listCases("w");
    const version = store.version("w");
    const changed: Case = { ...before.find((c) => c.id === "demo-inr-86")!, status: "closed" };
    await store.saveCase("w", changed);
    expect(store.version("w")).toBeGreaterThan(version);
    expect((await store.getCase("w", "demo-inr-86"))?.status).toBe("closed");
    expect((await store.listCases("w")).find((c) => c.id === "demo-inr-86")?.status).toBe("closed");
    expect(store.version("other")).toBe(0);
  });

  it("hands out copies, so callers can't change what's cached", async () => {
    const { store } = await setup();
    const first: Order[] = await store.listOrders("w");
    first[0]!.amount = 1;
    expect((await store.listOrders("w"))[0]!.amount).not.toBe(1);
  });

  it("never caches counters", async () => {
    const { store } = await setup();
    expect(await store.increment("k", 1, 60)).toBe(1);
    expect(await store.increment("k", 1, 60)).toBe(2);
  });

  it("drops a failed read so the next one tries again", async () => {
    const { store, inner } = await setup();
    const spy = vi.spyOn(inner, "listCases").mockRejectedValueOnce(new Error("unavailable"));
    await expect(store.listCases("w")).rejects.toThrow("unavailable");
    expect(await store.listCases("w")).toHaveLength(seed.cases.length);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
