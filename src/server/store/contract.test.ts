import { describe, expect, it } from "vitest";
import type { ChatThread } from "@/lib/chat-thread";
import type { Analysis, AppNotification, Case, Order, Shop } from "@/lib/domain";
import { testConnection, testRealShop, testUser } from "@/server/testing/shops";
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

const shop = (id: string, overrides: Partial<Shop> = {}): Shop =>
  testRealShop(testUser("owner-1"), { id, ...overrides });

const sealed = {
  v: 1 as const,
  alg: "A256GCM" as const,
  kid: "k1",
  key: { iv: "aXY=", tag: "dGFn", data: "ZGF0YQ==" },
  iv: "aXY=",
  tag: "dGFn",
  data: "c2VjcmV0",
  createdAt: "2026-10-28T09:00:00.000Z",
};

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

const chat = (
  id: string,
  uid: string,
  updatedAt: string,
  text = "Which cases are due?",
): ChatThread => ({
  id,
  uid,
  title: text,
  createdAt: "2026-10-28T09:00:00.000Z",
  updatedAt,
  messages: [
    {
      id: "m1",
      role: "user",
      parts: [{ type: "text", text }],
      streaming: false,
      model: null,
      cost: 0,
    },
    {
      id: "m2",
      role: "assistant",
      parts: [
        { type: "tool", id: "t1", name: "list_cases", label: "Read 3 cases", state: "done" },
        { type: "text", text: "Two are due this week." },
        { type: "card", card: { kind: "metric", label: "Due", value: "2" } },
      ],
      streaming: false,
      model: "nvidia/Nemotron-3_5-Lightning",
      cost: 0.0012,
    },
  ],
});

describe.each(stores)("the %s store", (_name, make) => {
  it("saves and reads shops, orders, cases and analyses, whatever fields are undefined", async () => {
    const store = make();
    const ws = `sh_${Math.random().toString(36).slice(2)}`;
    await store.saveShop(shop(ws));
    expect(await store.getShop(ws)).toEqual(shop(ws));
    expect(await store.getShop(`${ws}-missing`)).toBeNull();

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

  it("clears a shop's records, events and notifications included, but keeps the shop and its keys", async () => {
    const store = make();
    const ws = `sh_${Math.random().toString(36).slice(2)}`;
    await store.saveShop(shop(ws));
    await store.saveSecret(ws, "paypal", sealed);
    await store.saveNotification(ws, {
      id: "n1",
      kind: "dispute_opened",
      at: "2026-10-28T09:00:00.000Z",
      title: "New dispute",
      readBy: [],
    });
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
    await store.clearShop(ws);
    expect(await store.listOrders(ws)).toEqual([]);
    expect(await store.listCases(ws)).toEqual([]);
    expect(await store.listEvents(ws, "c1")).toEqual([]);
    expect(await store.getAnalysis(ws, "c1")).toBeNull();
    expect(await store.listNotifications(ws, 10)).toEqual([]);
    expect(await store.getShop(ws)).not.toBeNull();
    expect(await store.getSecret(ws, "paypal")).toEqual(sealed);
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
    const totals = await Promise.all(
      Array.from({ length: 3 }, () => store.increment(key, 1, 3600)),
    );
    expect([...totals].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(await store.increment(key, 0, 3600)).toBe(3);
    expect(await store.increment(key, -1, 3600)).toBe(2);
  }, 30_000);

  it("replaces a shop's records in one go, removing records the new data doesn't have", async () => {
    const store = make();
    const ws = `sh_${Math.random().toString(36).slice(2)}`;
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
    await store.replaceShop(
      {
        shop: shop(ws),
        orders: [order("W-1101"), order("W-1102")],
        cases: [kase("demo-inr-86")],
        events,
        cache: [{ key: `scans:${ws}`, value: { "W-1101": [] }, ttlSeconds: 60 }],
      },
      true,
    );
    expect(await store.getShop(ws)).toEqual(shop(ws));
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

    await store.replaceShop(
      { shop: shop(ws), orders: [order("W-1101")], cases: [kase("demo-inr-86")], events },
      false,
    );
    expect((await store.listOrders(ws)).map((o) => o.id)).toEqual(["W-1101"]);
    expect((await store.listEvents(ws, "demo-inr-86")).map((e) => e.id)).toEqual(["e1"]);
    expect(await store.listAnalyses(ws)).toEqual([]);
  });

  it("saves accounts, and finds a person's shops and the shops on one PayPal app", async () => {
    const store = make();
    const tag = Math.random().toString(36).slice(2);
    const user = testUser(`uid-${tag}`);
    await store.saveUser(user);
    expect(await store.getUser(user.uid)).toEqual(user);
    expect(await store.getUser(`${user.uid}-missing`)).toBeNull();

    const hash = `hash-${tag}`;
    const mine = shop(`sh_mine${tag}`, {
      ownerUid: user.uid,
      memberIds: [user.uid],
      paypal: testConnection({ clientIdHash: hash }),
    });
    const unconnected = shop(`sh_none${tag}`, {
      ownerUid: user.uid,
      memberIds: [user.uid],
      paypal: null,
    });
    const theirs = shop(`sh_them${tag}`, { paypal: testConnection({ clientIdHash: hash }) });
    for (const s of [mine, unconnected, theirs]) await store.saveShop(s);

    expect((await store.listShopsFor(user.uid)).map((s) => s.id).sort()).toEqual(
      [mine.id, unconnected.id].sort(),
    );
    expect((await store.listShopsByPayPalApp(hash)).map((s) => s.id).sort()).toEqual(
      [mine.id, theirs.id].sort(),
    );
    const connected = (await store.listConnectedShops()).map((s) => s.id);
    expect(connected).toEqual(expect.arrayContaining([mine.id, theirs.id]));
    expect(connected).not.toContain(unconnected.id);
    // Reading a shop back never carries the query field.
    expect(Object.keys((await store.getShop(mine.id))!)).not.toContain("paypalApp");
  });

  it("keeps a shop's secrets apart, and lists notifications newest first", async () => {
    const store = make();
    const ws = `sh_${Math.random().toString(36).slice(2)}`;
    await store.saveShop(shop(ws));
    expect(await store.getSecret(ws, "paypal")).toBeNull();
    await store.saveSecret(ws, "paypal", sealed);
    expect(await store.getSecret(ws, "paypal")).toEqual(sealed);
    expect(await store.getSecret(`${ws}-other`, "paypal")).toBeNull();
    await store.deleteSecret(ws, "paypal");
    expect(await store.getSecret(ws, "paypal")).toBeNull();

    const note = (id: string, at: string): AppNotification => ({
      id,
      kind: "dispute_opened",
      at,
      title: id,
      readBy: [],
    });
    await store.saveNotification(ws, note("old", "2026-10-27T09:00:00.000Z"));
    await store.saveNotification(ws, note("new", "2026-10-28T09:00:00.000Z"));
    await store.saveNotification(ws, {
      ...note("old", "2026-10-27T09:00:00.000Z"),
      readBy: ["u1"],
    });
    const listed = await store.listNotifications(ws, 10);
    expect(listed.map((n) => n.id)).toEqual(["new", "old"]);
    expect(listed[1]!.readBy).toEqual(["u1"]);
    expect(await store.listNotifications(ws, 1)).toHaveLength(1);
  });

  it("deletes a shop with everything beneath it, its secrets included", async () => {
    const store = make();
    const ws = `sh_${Math.random().toString(36).slice(2)}`;
    const other = `${ws}-other`;
    await store.saveShop(shop(ws));
    await store.saveShop(shop(other));
    await store.saveOrder(ws, order("W-1"));
    await store.addEvent(ws, "c1", {
      id: "e1",
      at: "2026-10-28T09:00:00.000Z",
      kind: "opened",
      actor: "buyer",
      title: "x",
    });
    await store.saveSecret(ws, "paypal", sealed);
    await store.saveOrder(other, order("W-1"));

    await store.deleteShop(ws);
    expect(await store.getShop(ws)).toBeNull();
    expect(await store.listOrders(ws)).toEqual([]);
    expect(await store.listEvents(ws, "c1")).toEqual([]);
    expect(await store.getSecret(ws, "paypal")).toBeNull();
    expect(await store.getShop(other)).not.toBeNull();
    expect(await store.listOrders(other)).toHaveLength(1);
  });

  it("keeps each person's chats to themselves, newest first, with every part of every message", async () => {
    const store = make();
    const ws = `sh_${Math.random().toString(36).slice(2)}`;
    await store.saveShop(shop(ws));
    await store.saveChat(ws, chat("ch_a", "u1", "2026-10-28T09:05:00.000Z"));
    await store.saveChat(ws, chat("ch_b", "u1", "2026-10-28T10:00:00.000Z", "Why did we lose?"));
    await store.saveChat(ws, chat("ch_c", "u2", "2026-10-28T11:00:00.000Z"));

    const mine = await store.listChats(ws, "u1", 10);
    expect(mine.map((c) => c.id)).toEqual(["ch_b", "ch_a"]);
    expect(mine[0]).toEqual({
      id: "ch_b",
      title: "Why did we lose?",
      createdAt: "2026-10-28T09:00:00.000Z",
      updatedAt: "2026-10-28T10:00:00.000Z",
      messageCount: 2,
    });
    expect(await store.listChats(ws, "u1", 1)).toHaveLength(1);
    expect(await store.getChat(ws, "u1", "ch_a")).toEqual(
      chat("ch_a", "u1", "2026-10-28T09:05:00.000Z"),
    );
    // Someone else's chat isn't found, even by its ID.
    expect(await store.getChat(ws, "u1", "ch_c")).toBeNull();

    await store.deleteChat(ws, "u1", "ch_a");
    expect((await store.listChats(ws, "u1", 10)).map((c) => c.id)).toEqual(["ch_b"]);
    // Clearing the shop's records leaves chats; clearing chats takes everyone's.
    await store.clearShop(ws);
    expect(await store.listChats(ws, "u1", 10)).toHaveLength(1);
    await store.clearChats(ws);
    expect(await store.listChats(ws, "u1", 10)).toEqual([]);
    expect(await store.listChats(ws, "u2", 10)).toEqual([]);
  });
});
