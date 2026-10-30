import "server-only";

import { productById } from "@/lib/catalog";
import type {
  Address,
  Buyer,
  Case,
  CaseEvent,
  Order,
  OrderItem,
  ProtectionStatus,
  Shop,
  TrackingEvent,
} from "@/lib/domain";
import { caseProtection } from "@/lib/rules/protection";
import { closingFigures } from "@/server/actions/close";
import type { Store } from "@/server/store";
import { isBulk, seedsOnRead } from "@/server/store/bulk";
import { randomAddress, randomBuyer, randomCity, type City } from "./places";
import { seededRng, type Rng } from "./rng";
import {
  PENDING_SCANS_TTL_SECONDS,
  pendingScansKey,
  savePendingScans,
  splitScans,
  statusFromScans,
  type PendingScans,
} from "./scans";
import { STORY_CASES, STORY_ORDERS, TO_SHIP_IDS, type StoryOrder, type When } from "./stories";
import { deliveryTime, scanHistory, uspsNumber, type DeliveredAt } from "./usps";

/**
 * The Wick & Ember sample shop: about 240 orders over 90 days, five open cases that tell the
 * story, twelve closed ones for the dashboard, and two orders waiting to ship. It's deterministic:
 * the same random seed every time, and every date hangs from the midnight (UTC) before the shop
 * was seeded.
 */

/** Bumped whenever the seed changes, so stale sample shops re-seed and cached analyses are redone. */
export const SEED_VERSION = "wick-ember-1";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** The newest order number; the two orders waiting to ship are always W-1101 and W-1102. */
const LAST_ORDER_NUMBER = 1102;

/** Midnight UTC on the day the shop was seeded. Shops seeded the same day are identical. */
export function seedAnchor(createdAt: string): number {
  const d = new Date(createdAt);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * The seed version plus the day its dates hang from, as stored on the shop. Key cached
 * analyses of seeded cases by this, so a replayed analysis cites the same dates the copy shows.
 */
export function seedVersionFor(createdAt: string): string {
  return `${SEED_VERSION}@${new Date(seedAnchor(createdAt)).toISOString().slice(0, 10)}`;
}

/** Whether a sample shop was seeded by this version of the seed. */
export function isCurrentSeed(seedVersion: string | null): boolean {
  return seedVersion?.split("@")[0] === SEED_VERSION;
}

/** Every seeded case's ID: the same in every sample shop, such as "demo-inr-86". */
export const SEED_CASE_IDS: readonly string[] = STORY_CASES.map((c) => c.id);

/** The five open cases, in the order the story tells them. */
export const OPEN_SEED_CASE_IDS: readonly string[] = STORY_CASES.filter((c) => !c.closed).map(
  (c) => c.id,
);

/** The seed case behind a case ID, or null for a case that isn't from the seed. */
export function seedCaseId(caseId: string): string | null {
  return SEED_CASE_IDS.includes(caseId) ? caseId : null;
}

export interface DemoSeed {
  orders: Order[];
  cases: Case[];
  /** Each case's events, oldest first. */
  events: Record<string, CaseEvent[]>;
  /** Simulated scans for parcels still on their way, which play out after the copy is made. */
  pendingScans: PendingScans;
}

/** An order before it has its number. */
interface Draft {
  key: string;
  placedAt: number;
  buyer: Buyer;
  home: Address;
  shipTo: Address;
  items: OrderItem[];
  protection: ProtectionStatus;
  scans: TrackingEvent[] | null;
  trackingNumber: string | null;
  uploaded: boolean;
  refunded?: "full" | "partial";
  note?: string;
  paypalOrderId: string;
  captureId: string;
}

/** Builds the whole seed for a copy made at `createdAt`. Pure: no store, no clock. */
export function buildSeed(createdAt: string): DemoSeed {
  const anchor = seedAnchor(createdAt);
  const at = ([daysAgo, utc]: When) => {
    const [h = 0, m = 0] = utc.split(":").map(Number);
    return anchor - daysAgo * DAY + h * HOUR + m * MINUTE;
  };

  const drafts = [
    ...STORY_ORDERS.map((story) => storyDraft(story, at)),
    ...fillerDrafts(seededRng(0x7ac3_2026), anchor),
  ];
  const ids = numberOrders(drafts, anchor);
  const pendingScans: PendingScans = {};
  const orders = drafts.map((draft) => {
    const id = ids.get(draft)!;
    const order = toOrder(draft, id, anchor);
    const future = draft.scans ? splitScans(draft.scans, anchor).future : [];
    if (future.length) pendingScans[id] = future;
    return order;
  });
  const byKey = new Map(drafts.map((d, i) => [d.key, orders[i]!]));

  const events: Record<string, CaseEvent[]> = {};
  const cases = STORY_CASES.map((story) => {
    const order = byKey.get(story.orderKey);
    if (!order) throw new Error(`The seed has no order ${story.orderKey}`);
    const messages = story.messages.map((m, i) => ({
      id: `${story.id}-m${i + 1}`,
      from: m.from,
      at: iso(at(m.at)),
      text: m.text,
    }));
    events[story.id] = story.events.map((e, i) => ({
      id: `${story.id}-e${i + 1}`,
      at: iso(at(e.at)),
      kind: e.kind,
      actor: e.actor,
      title: e.title,
      ...(e.detail ? { detail: e.detail } : {}),
    }));
    const closed = story.closed;
    const figures = closed
      ? closingFigures({
          amount: order.amount,
          reason: story.reason,
          stage: story.stage,
          outcome: closed.outcome,
          refunded: closed.refunded,
          protectedSale: caseProtection(story.reason, order).covered,
          highVolume: false,
        })
      : { moneyKept: 0, feeCharged: 0, feeAvoided: 0 };
    const times = [...messages.map((m) => m.at), ...events[story.id]!.map((e) => e.at)];
    const kase: Case = {
      id: story.id,
      paypalDisputeId: `PP-D-${story.disputeNumber}`,
      orderId: order.id,
      reason: story.reason,
      stage: story.stage,
      status: story.status,
      amount: order.amount,
      buyer: order.buyer,
      itemSummary: itemSummary(order.items),
      openedAt: iso(at(story.opened)),
      dueAt: story.dueInDays !== undefined ? dueAt(anchor, story.dueInDays) : null,
      buyerClaim: story.buyerClaim,
      messages,
      photos: story.photos ?? [],
      outcome: closed?.outcome ?? null,
      closedAt: closed ? iso(at(closed.at)) : null,
      ...figures,
      updatedAt: times.sort().at(-1) ?? iso(at(story.opened)),
    };
    return kase;
  });

  return { orders, cases, events, pendingScans };
}

/** Seeds built recently, by the day they hang from: copies made the same day share one. */
const built = new Map<string, DemoSeed>();

/**
 * The seed for a copy made at `createdAt`, built once a day and shared. Treat it as read-only:
 * anything handed out from it must be copied first.
 */
export function seedOf(createdAt: string): DemoSeed {
  const day = seedVersionFor(createdAt);
  let seed = built.get(day);
  if (!seed) {
    seed = buildSeed(createdAt);
    built.set(day, seed);
    // A few days is plenty: copies live a week, and most are made today.
    if (built.size > 4) built.delete(built.keys().next().value!);
  }
  return seed;
}

/**
 * Writes a fresh seed into a sample shop, replacing whatever was there, and marks the version and
 * the moment its dates hang from. On Firestore the seed isn't written at all: the store works it
 * out on read from the seed's day (see SeededStore), so seeding is one small write. Other stores
 * get the records themselves, in one go where they can. `fresh` (a brand-new shop) skips
 * removing old ones.
 */
export async function seedSample(
  store: Store,
  shop: Shop,
  options: { fresh?: boolean; now?: Date } = {},
): Promise<Shop> {
  const at = (options.now ?? new Date()).toISOString();
  const seed = seedOf(at);
  const seeded: Shop = { ...shop, seedVersion: seedVersionFor(at), seededAt: at, updatedAt: at };
  const scans = {
    key: pendingScansKey(shop.id),
    value: seed.pendingScans,
    ttlSeconds: PENDING_SCANS_TTL_SECONDS,
  };
  if (isBulk(store)) {
    const records = seedsOnRead(store)
      ? { orders: [], cases: [], events: {} }
      : { orders: seed.orders, cases: seed.cases, events: seed.events };
    await store.replaceShop({ shop: seeded, ...records, cache: [scans] }, options.fresh ?? false);
    return seeded;
  }
  await store.clearShop(shop.id);
  const writes: (() => Promise<void>)[] = [
    ...seed.orders.map((order) => () => store.saveOrder(shop.id, order)),
    ...seed.cases.map((kase) => () => store.saveCase(shop.id, kase)),
    ...Object.entries(seed.events).flatMap(([caseId, events]) =>
      events.map((event) => () => store.addEvent(shop.id, caseId, event)),
    ),
  ];
  await runAll(writes, 48);
  await savePendingScans(store, shop.id, seed.pendingScans);
  await store.saveShop(seeded);
  return seeded;
}

/** Runs tasks with at most `limit` in flight, so seeding a copy takes one round of Firestore writes. */
async function runAll(tasks: (() => Promise<void>)[], limit: number): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) await tasks[next++]!();
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

// ---------- Orders ----------

function storyDraft(story: StoryOrder, at: (when: When) => number): Draft {
  const rng = seededRng(hash(story.key));
  const ship = story.ship;
  const scans = ship
    ? scanHistory(rng, {
        labelAt: at(ship.label),
        city: story.city,
        deliverAt: ship.deliver ? at(ship.deliver) : null,
        deliveredAt: ship.deliveredAt,
        trouble: ship.trouble?.kind,
        troubleAt: ship.trouble ? at(ship.trouble.at) : undefined,
        missentTo: ship.trouble?.missentTo,
        route: ship.route,
      })
    : null;
  return {
    key: story.key,
    placedAt: at(story.placed),
    buyer: story.buyer,
    home: story.home,
    shipTo: story.shipTo ?? story.home,
    items: story.items.map(({ productId, quantity }) => item(productId, quantity)),
    protection: story.protection,
    scans,
    trackingNumber: scans ? uspsNumber(rng) : null,
    uploaded: true,
    refunded: story.refunded,
    note: story.note,
    paypalOrderId: paypalId(rng),
    captureId: paypalId(rng),
  };
}

const PRODUCT_WEIGHTS = (holiday: boolean) => [
  { item: "p-cedar-smoke-trio", weight: 16 },
  { item: "p-fig-linen", weight: 16 },
  { item: "p-salt-sea-moss", weight: 13 },
  { item: "p-honey-tobacco", weight: 13 },
  { item: "p-amber-glow-pillar", weight: 12 },
  { item: "p-ember-mug", weight: 8 },
  { item: "p-winter-grove-box", weight: holiday ? 14 : 3 },
  { item: "p-brass-trimmer", weight: 4 },
];

const DELIVERED_WEIGHTS: { item: DeliveredAt; weight: number }[] = [
  { item: "mailbox", weight: 46 },
  { item: "porch", weight: 34 },
  { item: "locker", weight: 8 },
  { item: "individual", weight: 6 },
  { item: "mailroom", weight: 6 },
];

/** Everyday orders, a little busier each week toward the holidays. */
function fillerDrafts(rng: Rng, anchor: number): Draft[] {
  const drafts: Draft[] = [];
  const regulars: { buyer: Buyer; home: Address; city: City }[] = [];
  for (let day = 89; day >= 2; day--) {
    const rate = 2.05 + (1 - day / 90);
    const count = Math.floor(rate + rng.next());
    for (let n = 0; n < count; n++) {
      // Buyers order between 8 am and 11 pm in the US: 15:00 to 06:00 UTC.
      const placedAt = anchor - day * DAY + 15 * HOUR + rng.int(0, 15 * 60 - 1) * MINUTE;
      const regular = regulars.length > 8 && rng.chance(0.12) ? rng.pick(regulars) : null;
      const city = regular?.city ?? randomCity(rng);
      const who = regular ?? { buyer: randomBuyer(rng), home: randomAddress(rng, city), city };
      if (!regular) regulars.push(who);

      const items = fillerItems(rng, day <= 35);
      // Labels go out the next working day; anything ordered late yesterday shipped by last night.
      let labelAt = Math.floor(placedAt / DAY) * DAY + DAY + 16 * HOUR + rng.int(0, 390) * MINUTE;
      if (labelAt > anchor - HOUR) labelAt = anchor - rng.int(2, 6) * HOUR;
      let deliverAt = deliveryTime(rng, labelAt + rng.int(city.days[0], city.days[1]) * DAY, city);
      if (deliverAt < labelAt + 18 * HOUR) deliverAt += DAY;
      const late = rng.chance(0.04);
      if (late) deliverAt += rng.int(1, 3) * DAY;
      const scans = scanHistory(rng, {
        labelAt,
        city,
        deliverAt,
        deliveredAt: rng.weighted(DELIVERED_WEIGHTS),
        trouble: late ? "late" : undefined,
        troubleAt: late ? labelAt + rng.int(30, 50) * HOUR : undefined,
      });
      drafts.push({
        key: `filler-${drafts.length + 1}`,
        placedAt,
        buyer: who.buyer,
        home: who.home,
        shipTo: who.home,
        items,
        protection: rng.weighted<ProtectionStatus>([
          { item: "ELIGIBLE", weight: 92 },
          { item: "PARTIALLY_ELIGIBLE", weight: 3 },
          { item: "NOT_ELIGIBLE", weight: 5 },
        ]),
        scans,
        trackingNumber: uspsNumber(rng),
        // Before the shop added tracking to PayPal every time, a few slipped through.
        uploaded: !(day > 45 && rng.chance(0.05)),
        paypalOrderId: paypalId(rng),
        captureId: paypalId(rng),
      });
    }
  }
  return drafts;
}

function fillerItems(rng: Rng, holiday: boolean): OrderItem[] {
  const first = rng.weighted(PRODUCT_WEIGHTS(holiday));
  const single =
    first === "p-cedar-smoke-trio" || first === "p-winter-grove-box" || first === "p-brass-trimmer";
  const items = [item(first, !single && rng.chance(0.12) ? 2 : 1)];
  if (rng.chance(0.18)) {
    const second = rng.chance(0.4)
      ? "p-brass-trimmer"
      : rng.weighted(PRODUCT_WEIGHTS(holiday).filter((p) => p.item !== first));
    if (second !== first) items.push(item(second, 1));
  }
  return items;
}

function item(productId: string, quantity: number): OrderItem {
  const product = productById(productId);
  if (!product) throw new Error(`The catalog has no ${productId}`);
  return { productId, name: product.name, quantity, unitPrice: product.price };
}

/**
 * Order numbers in the order they were placed, ending at W-1102. The two old orders behind the
 * oldest cases get lower numbers, spaced as if the shop kept selling in between.
 */
function numberOrders(drafts: Draft[], anchor: number): Map<Draft, string> {
  const since = anchor - 90 * DAY;
  const byTime = (a: Draft, b: Draft) => a.placedAt - b.placedAt;
  const recent = drafts.filter((d) => d.placedAt > since).sort(byTime);
  const old = drafts.filter((d) => d.placedAt <= since).sort(byTime);
  const ids = new Map<Draft, string>();
  const first = LAST_ORDER_NUMBER - recent.length + 1;
  recent.forEach((d, i) => ids.set(d, `W-${first + i}`));
  const oldest = recent[0]?.placedAt ?? anchor;
  let previous = first;
  for (const d of [...old].reverse()) {
    const number = Math.min(previous - 1, first - Math.round(((oldest - d.placedAt) / DAY) * 2.2));
    ids.set(d, `W-${number}`);
    previous = number;
  }
  for (const [key, id] of Object.entries(TO_SHIP_IDS)) {
    const draft = drafts.find((d) => d.key === key);
    if (!draft || ids.get(draft) !== id) throw new Error(`The seed should number ${key} as ${id}`);
  }
  return ids;
}

function toOrder(draft: Draft, id: string, anchor: number): Order {
  const past = draft.scans ? splitScans(draft.scans, anchor).past : [];
  const delivered = past.find((e) => e.status === "delivered");
  const status =
    draft.refunded === "full"
      ? "refunded"
      : draft.refunded === "partial"
        ? "partially_refunded"
        : statusFromScans(past, "paid");
  const order: Order = {
    id,
    paypalOrderId: draft.paypalOrderId,
    captureId: draft.captureId,
    buyer: draft.buyer,
    items: draft.items,
    placedAt: iso(draft.placedAt),
    status,
    amount: draft.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    protection: draft.protection,
    paypalAddress: draft.home,
    shipTo: draft.shipTo,
    tracking:
      draft.scans && draft.trackingNumber
        ? {
            carrier: "USPS",
            number: draft.trackingNumber,
            uploaded: draft.uploaded,
            deliveredAt: delivered?.at ?? null,
            signedFor: false,
            events: past,
          }
        : null,
  };
  if (draft.note) order.note = draft.note;
  return order;
}

/** "Cedar & Smoke candle trio", "2 × Honey & Tobacco", "Salt & Sea Moss and Fig & Linen". */
export function itemSummary(items: OrderItem[]): string {
  const parts = items.map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.name}` : i.name));
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** PayPal's style of due date: the end of a day in US Central time (04:59:59 UTC the next day). */
function dueAt(anchor: number, days: number): string {
  return iso(anchor + days * DAY + 4 * HOUR + 59 * MINUTE + 59_000);
}

const ID_LETTERS = "ABCDEFGHJKLMNPRSTUVWXY";

/** A 17-character ID in the style of PayPal's order and capture IDs. */
function paypalId(rng: Rng): string {
  let id = "";
  for (let i = 0; i < 17; i++)
    id += rng.chance(0.7) ? String(rng.int(0, 9)) : rng.pick([...ID_LETTERS]);
  return id;
}

/** FNV-1a: a stable number from a story's key, so each story order gets its own random stream. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const iso = (ms: number) => new Date(ms).toISOString();
