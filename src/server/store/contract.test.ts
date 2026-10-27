import { describe, expect, it } from "vitest";
import type { Analysis, Case, Order, Workspace } from "@/lib/domain";
import type { BulkStore } from "./bulk";
import { CachedStore } from "./cached";
import { FirestoreStore } from "./firestore";
import { MemoryStore } from "./memory";
import type { Store } from "./types";

/**
 * The Store contract, run against the memory store and the read cache in front of it always, and
 * against Firestore (with and without the cache) when the emulator is running
 * (FIRESTORE_EMULATOR_HOST set), so every store behaves the same.
 */

type Full = Store & BulkStore;
const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const stores: [string, () => Full][] = [
  ["memory", () => new MemoryStore()],
  ["cached memory", () => new CachedStore(new MemoryStore())],
];
if (emulator) {
  const project = `demo-truce-${Date.now()}`;
  stores.push(["firestore", () => new FirestoreStore(project)]);
  stores.push(["cached firestore", () => new CachedStore(new FirestoreStore(project))]);
}

const workspace = (id: string): Workspace => ({
  id,
  kind: "demo",
  shopName: "Wick & Ember",
  createdAt: "2026-10-28T09:00:00.000Z",
  expiresAt: "2026-11-04T09:00:00.000Z",
  lastSweepAt: null,
  seedVersion: "wick-ember-1@2026-10-28",
});

const order = (id: string): Order => ({
  id,
  paypalOrderId: null,
  captureId: null,
  buyer: { name: "Nora Castillo", email: "nora@example.com" },
  items: [{ productId: "p-fig-linen", name: "Fig & Linen", quantity: 1, unitPrice: 3200 }],
  placedAt: "2026-10-27T17:42:00.000Z",
  status: "paid",
  amount: 3200,
  protection: "ELIGIBLE",
  paypalAddress: {
    line1: "2875 Agate St",
    city: "Eugene",
    state: "OR",
    postalCode: "97405",
    country: "US",
  },
  shipTo: {
    line1: "2875 Agate St",
    line2: undefined,
    city: "Eugene",
    state: "OR",
    postalCode: "97405",
    country: "US",
  },
  tracking: null,
});

const kase = (id: string): Case => ({
  id,
  paypalDisputeId: "PP-D-48121",
  orderId: "W-1101",
  reason: "not_received",
  stage: "inquiry",
  status: "needs_you",
  amount: 3200,
  buyer: { name: "Nora Castillo", email: "nora@example.com" },
  itemSummary: "Fig & Linen",
  openedAt: "2026-10-27T18:00:00.000Z",
  dueAt: null,
  buyerClaim: "It never came.",
  messages: [{ id: "m1", from: "buyer", at: "2026-10-27T18:00:00.000Z", text: "It never came." }],
  photos: [],
  outcome: null,
  closedAt: null,
  moneyKept: 0,
  feeCharged: 0,
  feeAvoided: 0,
  updatedAt: "2026-10-27T18:00:00.000Z",
});

describe.each(stores)("the %s store", (_name, make) => {
  it("saves and reads workspaces, orders, cases and analyses, whatever fields are undefined", async () => {
    const store = make();
    const ws = `ws-${Math.random().toString(36).slice(2)}`;
    await store.saveWorkspace(workspace(ws));
    expect(await store.getWorkspace(ws)).toEqual(workspace(ws));
    expect(await store.getWorkspace(`${ws}-missing`)).toBeNull();

    await store.saveOrder(ws, order("W-1101"));
    const read = await store.getOrder(ws, "W-1101");
    // Firestore refuses undefined values; the store drops them, so this reads back the same.
    expect(read).toEqual(order("W-1101"));
    expect((await store.listOrders(ws)).map((o) => o.id)).toEqual(["W-1101"]);

    await store.saveCase(ws, kase("demo-inr-86"));
    await store.saveCase(ws, { ...kase("demo-inr-86"), status: "waiting_buyer" });
    expect((await store.listCases(ws)).map((c) => c.status)).toEqual(["waiting_buyer"]);

    const analysis = {
      caseId: "demo-inr-86",
      totalCost: 0.02,
      steps: [],
      evidence: [{ id: "E1" }],
    } as unknown as Analysis;
    await store.saveAnalysis(ws, analysis);
    expect(await store.getAnalysis(ws, "demo-inr-86")).toEqual(analysis);
  });

  it("keeps events per case, oldest first, and replaces one saved twice", async () => {
    const store = make();
    const ws = `ws-${Math.random().toString(36).slice(2)}`;
    await store.addEvent(ws, "c1", {
      id: "e2",
      at: "2026-10-28T10:00:00.000Z",
      kind: "sent",
      actor: "truce",
      title: "Sent",
      simulated: true,
    });
    await store.addEvent(ws, "c1", {
      id: "e1",
      at: "2026-10-28T09:00:00.000Z",
      kind: "approved",
      actor: "seller",
      title: "Approved",
      detail: undefined,
    });
    await store.addEvent(ws, "c1", {
      id: "e2",
      at: "2026-10-28T10:00:00.000Z",
      kind: "sent",
      actor: "truce",
      title: "Sent again",
    });
    await store.addEvent(ws, "c2", {
      id: "e9",
      at: "2026-10-28T08:00:00.000Z",
      kind: "note",
      actor: "paypal",
      title: "Other case",
    });
    const events = await store.listEvents(ws, "c1");
    expect(events.map((e) => [e.id, e.title])).toEqual([
      ["e1", "Approved"],
      ["e2", "Sent again"],
    ]);
  });

  it("clears a workspace's records, events included, but keeps the workspace", async () => {
    const store = make();
    const ws = `ws-${Math.random().toString(36).slice(2)}`;
    await store.saveWorkspace(workspace(ws));
    await store.saveOrder(ws, order("W-1"));
    await store.saveCase(ws, kase("c1"));
    await store.addEvent(ws, "c1", {
      id: "e1",
      at: "2026-10-28T09:00:00.000Z",
      kind: "opened",
      actor: "buyer",
      title: "Opened",
    });
    await store.saveAnalysis(ws, { caseId: "c1", steps: [], totalCost: 0 } as unknown as Analysis);
    await store.clearWorkspace(ws);
    expect(await store.listOrders(ws)).toEqual([]);
    expect(await store.listCases(ws)).toEqual([]);
    expect(await store.listEvents(ws, "c1")).toEqual([]);
    expect(await store.getAnalysis(ws, "c1")).toBeNull();
    expect(await store.getWorkspace(ws)).not.toBeNull();
  });

  it("caches any shape, under any key, until it expires", async () => {
    const store = make();
    const key = `analysis:wick-ember-1@2026-10-28:demo-inr-86:p1/${Math.random()}`;
    const value = { events: [{ type: "step" }], vector: [[0.1, 0.2], [0.3]] };
    await store.setCached(key, value, 60);
    expect(await store.getCached(key)).toEqual(value);
    await store.setCached(`${key}:gone`, 1, 0.001);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await store.getCached(`${key}:gone`)).toBeNull();
    expect(await store.getCached(`${key}:never`)).toBeNull();
  });

  it("gives each of several callers at once its own exact total", async () => {
    const store = make();
    const key = `approve:${Math.random()}`;
    const totals = await Promise.all(Array.from({ length: 3 }, () => store.increment(key, 1, 20)));
    expect([...totals].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(await store.increment(key, 0, 20)).toBe(3);
    expect(await store.increment(key, -1, 20)).toBe(2);
  }, 30_000);

  it("replaces a workspace in one go, removing records the new data doesn't have", async () => {
    const store = make();
    const ws = `ws-${Math.random().toString(36).slice(2)}`;
    const events = {
      "demo-inr-86": [
        {
          id: "e1",
          at: "2026-10-28T09:00:00.000Z",
          kind: "opened" as const,
          actor: "buyer" as const,
          title: "Opened",
        },
      ],
    };
    await store.replaceWorkspace(
      {
        workspace: workspace(ws),
        orders: [order("W-1101"), order("W-1102")],
        cases: [kase("demo-inr-86")],
        events,
        cache: [{ key: `scans:${ws}`, value: { "W-1101": [] }, ttlSeconds: 60 }],
      },
      true,
    );
    expect(await store.getWorkspace(ws)).toEqual(workspace(ws));
    expect((await store.listOrders(ws)).map((o) => o.id).sort()).toEqual(["W-1101", "W-1102"]);
    expect(await store.getCached(`scans:${ws}`)).toEqual({ "W-1101": [] });

    // Things added since: an order, an event, an analysis.
    await store.saveOrder(ws, order("W-1103"));
    await store.addEvent(ws, "demo-inr-86", {
      id: "ev-new",
      at: "2026-10-28T10:00:00.000Z",
      kind: "sent",
      actor: "truce",
      title: "Sent",
    });
    await store.saveAnalysis(ws, {
      caseId: "demo-inr-86",
      steps: [],
      totalCost: 0.01,
    } as unknown as Analysis);
    expect(await store.listAnalyses(ws)).toHaveLength(1);

    await store.replaceWorkspace(
      { workspace: workspace(ws), orders: [order("W-1101")], cases: [kase("demo-inr-86")], events },
      false,
    );
    expect((await store.listOrders(ws)).map((o) => o.id)).toEqual(["W-1101"]);
    expect((await store.listEvents(ws, "demo-inr-86")).map((e) => e.id)).toEqual(["e1"]);
    expect(await store.listAnalyses(ws)).toEqual([]);
  });

  it("finds expired workspaces and deletes them with everything beneath", async () => {
    const store = make();
    const tag = Math.random().toString(36).slice(2);
    const old = { ...workspace(`demo-old-${tag}`), expiresAt: "2020-01-01T00:00:00.000Z" };
    const current = { ...workspace(`demo-new-${tag}`), expiresAt: "2999-01-01T00:00:00.000Z" };
    const live = { ...workspace(`live-${tag}`), kind: "live" as const, expiresAt: null };
    for (const w of [old, current, live]) await store.saveWorkspace(w);
    await store.saveOrder(old.id, order("W-1"));
    await store.addEvent(old.id, "c1", {
      id: "e1",
      at: "2026-10-28T09:00:00.000Z",
      kind: "opened",
      actor: "buyer",
      title: "x",
    });
    await store.setCached(`scans:${old.id}`, { a: 1 });

    const expired = await store.expiredWorkspaces(new Date("2026-10-28T00:00:00.000Z"), 500);
    expect(expired).toContain(old.id);
    expect(expired).not.toContain(current.id);
    expect(expired).not.toContain(live.id);

    await store.deleteWorkspace(old.id, [`scans:${old.id}`]);
    expect(await store.getWorkspace(old.id)).toBeNull();
    expect(await store.listOrders(old.id)).toEqual([]);
    expect(await store.listEvents(old.id, "c1")).toEqual([]);
    expect(await store.getCached(`scans:${old.id}`)).toBeNull();
    expect(await store.getWorkspace(current.id)).not.toBeNull();
  });
});
