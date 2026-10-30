import { describe, expect, it } from "vitest";
import type { Shop } from "@/lib/domain";
import { approveCase } from "@/server/actions/approve";
import { testRealShop, testUser } from "@/server/testing/shops";
import { playDueReactions } from "@/server/actions/reactions";
import { MemoryStore } from "@/server/store/memory";
import { SeededStore } from "./overlay";
import { loadPendingScans } from "./scans";
import { sampleShop } from "./sample";
import { buildSeed, seedOf, seedSample } from "./seed";

const created = "2026-10-28T15:20:00.000Z";
const seed = buildSeed(created);

const copy = (id: string): Shop => sampleShop(testUser(), new Date(created), null, id);

async function setup() {
  const clock = { now: Date.parse(created) };
  const inner = new MemoryStore(() => clock.now);
  const store = new SeededStore(inner);
  const shop = await seedSample(store, copy("sh_overlaytests0001"), {
    fresh: true,
    now: new Date(created),
  });
  return { inner, store, shop, clock };
}

describe("sample shops worked out from the seed on read", () => {
  it("store only the shop and its pending scans, yet read as the whole seed", async () => {
    const { inner, store, shop } = await setup();
    expect(await inner.listOrders(shop.id)).toEqual([]);
    expect(await inner.listCases(shop.id)).toEqual([]);
    expect(await loadPendingScans(inner, shop.id)).toEqual(seed.pendingScans);

    expect(await store.listOrders(shop.id)).toEqual(seed.orders);
    expect(await store.listCases(shop.id)).toEqual(seed.cases);
    expect(await store.getCase(shop.id, "demo-inr-64")).toEqual(
      seed.cases.find((c) => c.id === "demo-inr-64"),
    );
    expect(await store.getOrder(shop.id, "W-1102")).toMatchObject({
      note: expect.any(String),
    });
    expect(await store.listEvents(shop.id, "demo-inr-64")).toEqual(seed.events["demo-inr-64"]);
    expect(await store.getCase(shop.id, "nope")).toBeNull();
  });

  it("put stored changes in place of seeded records, and add new ones", async () => {
    const { store, shop } = await setup();
    const kase = (await store.getCase(shop.id, "demo-inr-86"))!;
    await store.saveCase(shop.id, { ...kase, status: "waiting_buyer" });
    await store.saveOrder(shop.id, { ...seed.orders[0]!, id: "W-1103" });
    await store.addEvent(shop.id, "demo-inr-86", {
      id: "ev-1",
      at: "2026-10-28T16:00:00.000Z",
      kind: "approved",
      actor: "seller",
      title: "You approved the reply",
    });

    const cases = await store.listCases(shop.id);
    expect(cases).toHaveLength(seed.cases.length);
    expect(cases.find((c) => c.id === "demo-inr-86")?.status).toBe("waiting_buyer");
    expect((await store.getCase(shop.id, "demo-inr-86"))?.status).toBe("waiting_buyer");
    expect((await store.listOrders(shop.id)).map((o) => o.id)).toContain("W-1103");
    expect((await store.listEvents(shop.id, "demo-inr-86")).map((e) => e.id)).toEqual([
      "demo-inr-86-e1",
      "ev-1",
    ]);
  });

  it("never let a caller change the shared seed", async () => {
    const { store, shop } = await setup();
    const orders = await store.listOrders(shop.id);
    orders[0]!.amount = 1;
    (await store.getCase(shop.id, "demo-inr-86"))!.status = "closed";
    expect(seedOf(created).orders[0]!.amount).not.toBe(1);
    expect((await store.getCase(shop.id, "demo-inr-86"))!.status).toBe("needs_you");
  });

  it("start over on reset, dropping every stored change", async () => {
    const { inner, store, shop } = await setup();
    await store.saveOrder(shop.id, { ...seed.orders[0]!, id: "W-1103" });
    await store.saveAnalysis(shop.id, {
      caseId: "demo-inr-86",
      steps: [],
      totalCost: 0,
    } as never);
    await seedSample(store, shop, { now: new Date(created) });
    expect(await inner.listOrders(shop.id)).toEqual([]);
    expect(await store.listAnalyses(shop.id)).toEqual([]);
    expect(await store.listOrders(shop.id)).toHaveLength(seed.orders.length);
  });

  it("leave real shops and sample shops from an older seed as they are", async () => {
    const { store } = await setup();
    const real = testRealShop();
    await store.saveShop(real);
    expect(await store.listOrders(real.id)).toEqual([]);
    await store.saveShop({
      ...copy("sh_oldseed00000001"),
      seedVersion: "wick-ember-0@2026-10-28",
      seededAt: created,
    });
    expect(await store.listCases("sh_oldseed00000001")).toEqual([]);
  });

  it("carry the whole story: approve, then the scripted reply closes the case", async () => {
    const { inner, store, shop, clock } = await setup();
    await approveCase({
      store,
      shop,
      caseId: "demo-inr-86",
      request: {
        move: "fight",
        draft: { kind: "message", text: "It was delivered.", evidenceIds: [] },
      },
      now: new Date(clock.now),
    });
    clock.now += 8_000;
    const [closed] = await playDueReactions(
      store,
      shop,
      [(await store.getCase(shop.id, "demo-inr-86"))!],
      new Date(clock.now),
    );
    expect(closed).toMatchObject({ outcome: "buyer_closed", moneyKept: 8600 });
    expect((await inner.listCases(shop.id)).map((c) => c.id)).toEqual(["demo-inr-86"]);
    expect((await store.listEvents(shop.id, "demo-inr-86")).map((e) => e.kind)).toEqual([
      "opened",
      "approved",
      "sent",
      "buyer_reply",
      "closed",
    ]);
  });
});
