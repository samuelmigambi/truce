import { describe, expect, it } from "vitest";
import type { Analysis, Case, CaseEvent, Order, Shop } from "@/lib/domain";
import { testRealShop } from "@/server/testing/shops";
import { docId, stripUndefined } from "./firestore";
import { chooseStore, gcpProject, hasGoogleCredentials } from "./index";
import { MemoryStore, memoryStore, sortEvents, windowOf } from "./memory";

const shop: Shop = testRealShop(undefined, { id: "demo-abc" });

const order: Order = {
  id: "W-1042",
  paypalOrderId: "7TG079141N6014335",
  captureId: "4P61893970934542E",
  buyer: { name: "Sam Rivera", email: "sam.rivera@example.com" },
  items: [
    {
      productId: "p-cedar-smoke-trio",
      name: "Cedar & Smoke candle trio",
      quantity: 1,
      unitPrice: 8600,
    },
  ],
  placedAt: "2026-10-18T03:12:00.000Z",
  status: "delivered",
  amount: 8600,
  protection: "ELIGIBLE",
  paypalAddress: null,
  shipTo: null,
  tracking: null,
};

const kase: Case = {
  id: "demo-inr-86",
  paypalDisputeId: "PP-D-48121",
  orderId: "W-1042",
  reason: "not_received",
  stage: "inquiry",
  status: "needs_you",
  amount: 8600,
  buyer: order.buyer,
  itemSummary: "Cedar & Smoke candle trio",
  openedAt: "2026-10-26T17:05:00.000Z",
  dueAt: null,
  buyerClaim: "My candles never arrived.",
  messages: [],
  photos: [],
  outcome: null,
  closedAt: null,
  moneyKept: 0,
  feeCharged: 0,
  feeAvoided: 0,
  updatedAt: "2026-10-26T17:05:00.000Z",
};

const event = (id: string, at: string): CaseEvent => ({
  id,
  at,
  kind: "note",
  actor: "truce",
  title: id,
});

describe("MemoryStore", () => {
  it("keeps each shop's records apart", async () => {
    const store = new MemoryStore();
    await store.saveShop(shop);
    await store.saveOrder("demo-abc", order);
    await store.saveCase("demo-abc", kase);
    expect(await store.getShop("demo-abc")).toEqual(shop);
    expect(await store.getOrder("demo-abc", "W-1042")).toEqual(order);
    expect(await store.getOrder("demo-other", "W-1042")).toBeNull();
    expect(await store.listCases("demo-other")).toEqual([]);
    expect(await store.listCases("demo-abc")).toEqual([kase]);
  });

  it("copies records in and out, so callers can't change what's stored", async () => {
    const store = new MemoryStore();
    const mine = structuredClone(order);
    await store.saveOrder("demo-abc", mine);
    mine.status = "refunded";
    const read = await store.getOrder("demo-abc", "W-1042");
    read!.amount = 1;
    expect(await store.getOrder("demo-abc", "W-1042")).toEqual(order);
  });

  it("lists events oldest first and replaces an event saved twice", async () => {
    const store = new MemoryStore();
    await store.addEvent("demo-abc", "demo-inr-86", event("b", "2026-10-27T10:00:00.000Z"));
    await store.addEvent("demo-abc", "demo-inr-86", event("a", "2026-10-26T10:00:00.000Z"));
    await store.addEvent("demo-abc", "demo-inr-86", {
      ...event("b", "2026-10-27T10:00:00.000Z"),
      title: "again",
    });
    const events = await store.listEvents("demo-abc", "demo-inr-86");
    expect(events.map((e) => [e.id, e.title])).toEqual([
      ["a", "a"],
      ["b", "again"],
    ]);
  });

  it("keeps analyses by case and clears a shop without touching its record", async () => {
    const store = new MemoryStore();
    const analysis = { caseId: "demo-inr-86", totalCost: 0.02, steps: [] } as unknown as Analysis;
    await store.saveShop(shop);
    await store.saveAnalysis("demo-abc", analysis);
    await store.saveOrder("demo-abc", order);
    expect(await store.getAnalysis("demo-abc", "demo-inr-86")).toEqual(analysis);
    await store.clearShop("demo-abc");
    expect(await store.getAnalysis("demo-abc", "demo-inr-86")).toBeNull();
    expect(await store.listOrders("demo-abc")).toEqual([]);
    expect(await store.getShop("demo-abc")).toEqual(shop);
  });

  it("expires cached values", async () => {
    let now = 1_000_000;
    const store = new MemoryStore(() => now);
    await store.setCached("analysis:x", { a: [1, [2]] }, 60);
    await store.setCached("forever", "kept");
    expect(await store.getCached("analysis:x")).toEqual({ a: [1, [2]] });
    now += 61_000;
    expect(await store.getCached("analysis:x")).toBeNull();
    expect(await store.getCached("forever")).toBe("kept");
    expect(await store.getCached("missing")).toBeNull();
  });

  it("counts within fixed windows and starts again in the next one", async () => {
    let now = Date.parse("2026-10-28T23:59:00.000Z");
    const store = new MemoryStore(() => now);
    expect(await store.increment("spend", 2, 86_400)).toBe(2);
    expect(await store.increment("spend", 3, 86_400)).toBe(5);
    expect(await store.increment("other", 1, 86_400)).toBe(1);
    now = Date.parse("2026-10-29T00:00:30.000Z");
    expect(await store.increment("spend", 1, 86_400)).toBe(1);
  });

  it("is one store per process", () => {
    expect(memoryStore()).toBe(memoryStore());
  });
});

describe("store helpers", () => {
  it("puts a daily window's start at midnight UTC", () => {
    const day = 86_400;
    expect(windowOf(Date.parse("2026-10-28T00:00:00.000Z"), day)).toBe(
      windowOf(Date.parse("2026-10-28T23:59:59.000Z"), day),
    );
    expect(windowOf(Date.parse("2026-10-29T00:00:00.000Z"), day)).toBe(
      windowOf(Date.parse("2026-10-28T00:00:00.000Z"), day) + 1,
    );
  });

  it("sorts events by time, then by ID", () => {
    const sorted = sortEvents([
      event("z", "2026-10-27T10:00:00Z"),
      event("b", "2026-10-26T10:00:00Z"),
      event("a", "2026-10-27T10:00:00Z"),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["b", "a", "z"]);
  });

  it("drops undefined at any depth, keeping nulls, arrays and class instances", () => {
    const date = new Date(0);
    expect(
      stripUndefined({
        a: 1,
        b: undefined,
        c: null,
        d: { e: undefined, f: [1, undefined, { g: undefined, h: 2 }] },
        date,
      }),
    ).toEqual({ a: 1, c: null, d: { f: [1, { h: 2 }] }, date });
    expect(stripUndefined({ date }).date).toBe(date);
  });

  it("makes safe Firestore document IDs", () => {
    expect(docId("W-1042")).toBe("W-1042");
    expect(docId("PP-R-SXM-10194828")).toBe("PP-R-SXM-10194828");
    expect(docId("embed:Qwen/Qwen3-Embedding-8B:abc")).not.toContain("/");
    expect(docId("..")).not.toBe("..");
    expect(docId("__name__")).toMatch(/^h-/);
    expect(docId("x".repeat(500))).toMatch(/^h-[0-9a-f]{64}$/);
    expect(docId("a/b")).not.toBe(docId("a%2Fb/"));
  });
});

describe("choosing a store", () => {
  const none = () => false;

  it("finds Google credentials on Cloud Run, from a key file, the emulator or gcloud's login", () => {
    expect(hasGoogleCredentials({ K_SERVICE: "truce" }, none)).toBe(true);
    expect(hasGoogleCredentials({ FIRESTORE_EMULATOR_HOST: "localhost:8080" }, none)).toBe(true);
    expect(
      hasGoogleCredentials(
        { GOOGLE_APPLICATION_CREDENTIALS: "/keys/sa.json" },
        (p) => p === "/keys/sa.json",
      ),
    ).toBe(true);
    expect(
      hasGoogleCredentials({ GOOGLE_APPLICATION_CREDENTIALS: "/keys/missing.json" }, none),
    ).toBe(false);
    expect(
      hasGoogleCredentials({ APPDATA: "C:\\Users\\me\\AppData\\Roaming" }, (p) =>
        p.includes("application_default_credentials.json"),
      ),
    ).toBe(true);
    expect(hasGoogleCredentials({ HOME: "/home/me" }, none)).toBe(false);
  });

  it("uses Firestore with credentials unless TRUCE_STORE says memory", () => {
    expect(chooseStore({}, () => true)).toBe("firestore");
    expect(chooseStore({}, () => false)).toBe("memory");
    expect(chooseStore({ TRUCE_STORE: "memory" }, () => true)).toBe("memory");
    expect(chooseStore({ TRUCE_STORE: "firestore" }, () => false)).toBe("firestore");
  });

  it("defaults to the truce-disputes project", () => {
    expect(gcpProject({})).toBe("truce-disputes");
    expect(gcpProject({ TRUCE_GCP_PROJECT: "other" })).toBe("other");
  });
});
