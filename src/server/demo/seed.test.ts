import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dueLabel, urgency } from "@/lib/rules/deadlines";
import { caseProtection, shippingChecks } from "@/lib/rules/protection";
import { shopRatio } from "@/server/metrics";
import { MemoryStore } from "@/server/store/memory";
import { testUser } from "@/server/testing/shops";
import { sampleShop } from "./sample";
import { checkDigit } from "./usps";
import {
  buildSeed,
  isCurrentSeed,
  OPEN_SEED_CASE_IDS,
  SEED_CASE_IDS,
  SEED_VERSION,
  seedAnchor,
  seedCaseId,
  seedSample,
  seedVersionFor,
} from "./seed";

const DAY = 24 * 60 * 60 * 1000;
const created = "2026-10-28T15:20:00.000Z";
const seed = buildSeed(created);
const now = Date.parse(created);
const byId = (id: string) => seed.cases.find((c) => c.id === id)!;
const orderOf = (caseId: string) => seed.orders.find((o) => o.id === byId(caseId).orderId)!;

/** Every timestamp the seed wrote, except due dates, which are in the future. */
function pastTimes(s: typeof seed): number[] {
  return [
    ...s.orders.flatMap((o) => [
      o.placedAt,
      ...(o.tracking?.events ?? []).map((e) => e.at),
      o.tracking?.deliveredAt,
    ]),
    ...s.cases.flatMap((c) => [
      c.openedAt,
      c.closedAt,
      c.updatedAt,
      ...c.messages.map((m) => m.at),
    ]),
    ...Object.values(s.events).flatMap((list) => list.map((e) => e.at)),
  ]
    .filter((t): t is string => typeof t === "string")
    .map((t) => Date.parse(t));
}

describe("the demo seed", () => {
  it("is deterministic, and identical for copies made the same day", () => {
    expect(buildSeed(created)).toEqual(seed);
    expect(buildSeed("2026-10-28T00:00:05.000Z")).toEqual(seed);
    expect(buildSeed("2026-10-28T23:59:00.000Z")).toEqual(seed);
  });

  it("hangs every date from the day the copy was made", () => {
    const later = buildSeed("2026-11-02T08:00:00.000Z");
    const shift = 5 * DAY;
    expect(pastTimes(later)).toEqual(pastTimes(seed).map((t) => t + shift));
    expect(later.cases.map((c) => c.dueAt && Date.parse(c.dueAt))).toEqual(
      seed.cases.map((c) => c.dueAt && Date.parse(c.dueAt) + shift),
    );
    expect(later.orders.map((o) => o.id)).toEqual(seed.orders.map((o) => o.id));
  });

  it("puts nothing after the moment the copy was made; parcels still moving wait as pending scans", () => {
    const anchor = seedAnchor(created);
    expect(Math.max(...pastTimes(seed))).toBeLessThanOrEqual(anchor);
    const pending = Object.values(seed.pendingScans).flat();
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((e) => Date.parse(e.at) > anchor)).toBe(true);
    expect(
      Object.keys(seed.pendingScans).every((id) =>
        seed.orders.some(
          (o) => o.id === id && (o.status === "shipped" || o.status === "label_created"),
        ),
      ),
    ).toBe(true);
  });

  it("tells the five open cases' story", () => {
    expect(OPEN_SEED_CASE_IDS).toEqual([
      "demo-inr-86",
      "demo-nad-42",
      "demo-unauth-120",
      "demo-damaged-28",
      "demo-inr-64",
    ]);
    const open = seed.cases.filter((c) => c.status !== "closed");
    expect(open.map((c) => c.id).sort()).toEqual([...OPEN_SEED_CASE_IDS].sort());
    expect(open.map((c) => [c.id, c.reason, c.stage, c.amount, c.buyer.name])).toEqual(
      expect.arrayContaining([
        ["demo-inr-86", "not_received", "inquiry", 8600, "Sam Rivera"],
        ["demo-nad-42", "not_as_described", "inquiry", 4200, "Priya Shah"],
        ["demo-unauth-120", "unauthorized", "claim", 12000, "Jordan Lee"],
        ["demo-damaged-28", "not_as_described", "inquiry", 2800, "Alex Morgan"],
        ["demo-inr-64", "not_received", "claim", 6400, "Chris Park"],
      ]),
    );
    expect(
      open.every((c) => c.status === "needs_you" && c.paypalDisputeId.startsWith("PP-D-")),
    ).toBe(true);
    expect(byId("demo-inr-86").buyerClaim).toBe("My candles never arrived. It's been over a week.");
    expect(byId("demo-nad-42").photos[0]?.url).toBe("/demo/photos/amber-glow-ruler.png");
    expect(byId("demo-damaged-28").photos[0]?.url).toBe("/demo/photos/ember-mug-cracked.png");
    expect(byId("demo-inr-64").itemSummary).toBe("2 × Honey & Tobacco");
  });

  it("gives each open case the protection the story needs", () => {
    const covered = (id: string) => caseProtection(byId(id).reason, orderOf(id)).covered;
    expect(covered("demo-inr-86")).toBe(true);
    expect(covered("demo-unauth-120")).toBe(true);
    expect(covered("demo-nad-42")).toBe(false);
    expect(orderOf("demo-nad-42").protection).toBe("NOT_ELIGIBLE");
    expect(covered("demo-damaged-28")).toBe(false);
    expect(covered("demo-inr-64")).toBe(false);
    const stalled = orderOf("demo-inr-64").tracking!;
    expect(stalled.deliveredAt).toBeNull();
    expect(stalled.events!.at(-1)).toMatchObject({ status: "exception" });
    expect(now - Date.parse(stalled.events!.at(-1)!.at)).toBeGreaterThan(9 * DAY);
    const delivered = orderOf("demo-inr-86").tracking!;
    expect(delivered.events!.at(-1)!.detail).toBe("Delivered, Parcel Locker");
    expect(Math.round((now - Date.parse(delivered.deliveredAt!)) / DAY)).toBe(4);
  });

  it("dates the open cases as the story says", () => {
    const at = new Date(now);
    const label = (id: string) => dueLabel(new Date(byId(id).dueAt!), at);
    expect(label("demo-inr-86")).toBe("Due in 8 days");
    expect(label("demo-unauth-120")).toBe("Due in 7 days");
    expect(urgency(new Date(byId("demo-inr-64").dueAt!), at)).toBe("soon");
    const ageDays = (id: string) => Math.floor((now - Date.parse(byId(id).openedAt)) / DAY);
    expect([
      ageDays("demo-inr-86"),
      ageDays("demo-nad-42"),
      ageDays("demo-unauth-120"),
      ageDays("demo-damaged-28"),
    ]).toEqual([1, 1, 2, 0]);
  });

  it("keeps the claims ratio under 1.5% with room to spare, for the whole week a copy lives", () => {
    for (const days of [0, 3, 7]) {
      const ratio = shopRatio(seed.orders, seed.cases, now + days * DAY);
      expect(ratio.ratio).toBeLessThan(0.015);
      expect(ratio.highVolume).toBe(false);
      expect(ratio.headroom).toBeGreaterThanOrEqual(1);
      expect(ratio.claims).toBe(2);
    }
    const sales = shopRatio(seed.orders, seed.cases, now).sales;
    expect(sales).toBeGreaterThan(200);
    expect(sales).toBeLessThan(270);
  });

  it("has twelve closed cases, with the mug dispute and three size settlements", () => {
    const closed = seed.cases.filter((c) => c.status === "closed");
    expect(closed).toHaveLength(12);
    expect(closed.every((c) => c.outcome && c.closedAt && c.dueAt === null)).toBe(true);
    const mug = byId("demo-mug-dispute");
    expect(mug).toMatchObject({
      outcome: "lost",
      stage: "claim",
      moneyKept: 0,
      feeCharged: 1500,
      feeAvoided: 0,
    });
    expect(mug.itemSummary).toBe("2 × Ember mug candle");
    const size = closed.filter(
      (c) => c.reason === "not_as_described" && /smaller|tiny/i.test(c.buyerClaim),
    );
    expect(size.map((c) => c.itemSummary).sort()).toEqual([
      "Amber Glow pillar candle",
      "Amber Glow pillar candle",
      "Fig & Linen",
    ]);
    expect(
      size.every(
        (c) => c.outcome === "settled" && c.feeAvoided === 1500 && c.moneyKept === c.amount - 1000,
      ),
    ).toBe(true);
    expect(
      closed.filter((c) => c.outcome === "won" || c.outcome === "buyer_closed").length,
    ).toBeGreaterThanOrEqual(4);
    expect(byId("demo-unauth-won")).toMatchObject({
      outcome: "won",
      reason: "unauthorized",
      feeCharged: 0,
    });
  });

  it("has W-1101 and W-1102 waiting to ship, and flags the office address on W-1102", () => {
    const w1101 = seed.orders.find((o) => o.id === "W-1101")!;
    const w1102 = seed.orders.find((o) => o.id === "W-1102")!;
    expect([w1101.status, w1102.status]).toEqual(["paid", "paid"]);
    expect([w1101.tracking, w1102.tracking]).toEqual([null, null]);
    expect(shippingChecks(w1101).covered).toBe(true);
    const checks = shippingChecks(w1102);
    expect(checks.covered).toBe(false);
    expect(checks.checks.find((c) => c.id === "address")?.ok).toBe(false);
    expect(w1102.note).toMatch(/office/);
    expect(
      seed.orders
        .filter((o) => o.status === "paid")
        .map((o) => o.id)
        .sort(),
    ).toEqual(["W-1101", "W-1102"]);
  });

  it("builds every order from the catalog, with numbers in order and real-looking tracking", () => {
    const ids = seed.orders.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const order of seed.orders) {
      expect(order.amount).toBe(order.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0));
      expect(order.buyer.email).toMatch(/@example\.(com|net|org)$/);
      expect(order.paypalOrderId).toMatch(/^[0-9A-Z]{17}$/);
      if (order.tracking) {
        expect(order.tracking.number).toMatch(/^94001118992\d{11}$/);
        expect(checkDigit(order.tracking.number.slice(0, 21))).toBe(order.tracking.number.at(-1));
      }
    }
    const byNumber = [...seed.orders].sort((a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2)));
    expect(byNumber.map((o) => o.placedAt)).toEqual([...byNumber.map((o) => o.placedAt)].sort());
  });

  it("knows its own case IDs and version", () => {
    expect(SEED_CASE_IDS).toHaveLength(17);
    expect(seedCaseId("demo-inr-86")).toBe("demo-inr-86");
    expect(seedCaseId("PP-R-SXM-10194828")).toBeNull();
    expect(seedVersionFor(created)).toBe(`${SEED_VERSION}@2026-10-28`);
    expect(isCurrentSeed(seedVersionFor(created))).toBe(true);
    expect(isCurrentSeed("wick-ember-0@2026-10-28")).toBe(false);
    expect(isCurrentSeed(null)).toBe(false);
  });

  it("ships the buyers' photos", () => {
    for (const name of ["amber-glow-ruler.png", "ember-mug-cracked.png"]) {
      expect(existsSync(join(process.cwd(), "public", "demo", "photos", name))).toBe(true);
    }
  });
});

describe("seedSample", () => {
  it("writes the seed into a sample shop and marks its version and day", async () => {
    const store = new MemoryStore(() => now);
    const shop = await seedSample(
      store,
      sampleShop(testUser(), new Date(created), null, "sh_seedtests000001"),
      {
        now: new Date(created),
      },
    );
    expect(shop.seedVersion).toBe(seedVersionFor(created));
    expect(shop.seededAt).toBe(created);
    expect(await store.getShop(shop.id)).toEqual(shop);
    expect(await store.listCases(shop.id)).toHaveLength(17);
    expect(await store.listOrders(shop.id)).toHaveLength(seed.orders.length);
    expect(await store.listEvents(shop.id, "demo-inr-64")).toHaveLength(4);

    // Seeding again starts over instead of adding to what's there.
    await store.saveOrder(shop.id, { ...seed.orders[0]!, id: "W-9999" });
    await seedSample(store, shop, { now: new Date(created) });
    expect(await store.getOrder(shop.id, "W-9999")).toBeNull();
  });
});
