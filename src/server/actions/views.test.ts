import { describe, expect, it, vi } from "vitest";
import { testSampleShop, testUser } from "@/server/testing/shops";
import { MemoryStore } from "@/server/store/memory";
import { approveCase } from "./approve";
import { caseFile, caseSummaries, metricsFor, ordersWithChecks } from "./views";

const created = "2026-10-28T15:20:00.000Z";

async function sampleCopy(id: string) {
  const clock = { now: Date.parse(created) };
  const store = new MemoryStore(() => clock.now);
  const shop = await testSampleShop(store, created, testUser(), id);
  return { store, shop, clock, at: () => new Date(clock.now) };
}

describe("reads", () => {
  it("keep metrics a few seconds, and work them out again after any write", async () => {
    const { store, shop, clock, at } = await sampleCopy("demo-views-tests-00000001");
    const reads = vi.spyOn(store, "listOrders");
    const first = await metricsFor(store, shop, at());
    clock.now += 2_000;
    expect(await metricsFor(store, shop, at())).toEqual(first);
    expect(reads).toHaveBeenCalledTimes(1);

    await approveCase({
      store,
      shop,
      caseId: "demo-damaged-28",
      request: {
        move: "refund",
        draft: { kind: "refund", text: "Refunded in full.", evidenceIds: [] },
      },
      now: at(),
    });
    const after = await metricsFor(store, shop, at());
    expect(reads.mock.calls.length).toBeGreaterThan(1);
    expect(after.openCases).toBe(first.openCases - 1);
    expect(after.moneyAtRisk).toBe(first.moneyAtRisk - 2800);
  });

  it("play a reply that refunds an order before showing the orders", async () => {
    const { store, shop, clock, at } = await sampleCopy("demo-views-tests-00000002");
    await approveCase({
      store,
      shop,
      caseId: "demo-nad-42",
      request: {
        move: "settle",
        draft: { kind: "offer", text: "Here's $10 back.", evidenceIds: [], offerAmount: 1000 },
      },
      now: at(),
    });
    clock.now += 8_000;
    const orders = await ordersWithChecks(store, shop, at());
    const kase = (await store.getCase(shop.id, "demo-nad-42"))!;
    expect(kase.outcome).toBe("settled");
    expect(orders.find((o) => o.id === kase.orderId)?.status).toBe("partially_refunded");
  });

  it("read analyses in one go for the inbox, and the case file with its order and events", async () => {
    const { store, shop, at } = await sampleCopy("demo-views-tests-00000003");
    await store.saveAnalysis(shop.id, {
      caseId: "demo-inr-86",
      recommendation: {
        move: "fight",
        confidence: "high",
        headline: "Fight: it was delivered.",
        reasons: [],
      },
      steps: [],
      totalCost: 0,
    } as never);
    const single = vi.spyOn(store, "getAnalysis");
    const inbox = await caseSummaries(store, shop, at());
    expect(single).not.toHaveBeenCalled();
    expect(inbox.find((c) => c.id === "demo-inr-86")).toMatchObject({
      analyzed: true,
      recommendation: { move: "fight", headline: "Fight: it was delivered." },
    });
    expect(inbox.filter((c) => c.analyzed)).toHaveLength(1);

    const file = await caseFile(store, shop, "demo-inr-86", at());
    expect(file.order?.id).toBe(file.case.orderId);
    expect(file.events.map((e) => e.kind)).toEqual(["opened"]);
    expect(file.analysis?.recommendation.move).toBe("fight");
  });
});
