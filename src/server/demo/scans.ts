import "server-only";

import type { Order, OrderStatus, Shop, TrackingEvent } from "@/lib/domain";
import type { Store } from "@/server/store";

/**
 * Simulated carrier scans in sample shops arrive over time, like real ones: scans still in the
 * future wait in the cache, outside the order, so nothing reading an order (the agent included)
 * can see a delivery before it happens. Reads play the ones whose time has come.
 */

/** Order ID to its scans still to come, for one sample shop. */
export type PendingScans = Record<string, TrackingEvent[]>;

/** Where a sample shop's scans still to come are kept, in the shared cache. */
export const pendingScansKey = (shopId: string) => `scans:${shopId}`;
/** Every simulated parcel has arrived well within this. */
export const PENDING_SCANS_TTL_SECONDS = 30 * 24 * 60 * 60;

export async function loadPendingScans(store: Store, shopId: string): Promise<PendingScans> {
  return (await store.getCached<PendingScans>(pendingScansKey(shopId))) ?? {};
}

export async function savePendingScans(
  store: Store,
  shopId: string,
  pending: PendingScans,
): Promise<void> {
  await store.setCached(pendingScansKey(shopId), pending, PENDING_SCANS_TTL_SECONDS);
}

/** Splits a scan schedule into what has happened by `now` and what's still to come. */
export function splitScans(events: TrackingEvent[], now: number) {
  const past = events.filter((e) => Date.parse(e.at) <= now);
  const future = events.filter((e) => Date.parse(e.at) > now);
  return { past, future };
}

/** The status the scans so far put an order in; refunds stay as they are. */
export function statusFromScans(events: TrackingEvent[], current: OrderStatus): OrderStatus {
  if (current === "refunded" || current === "partially_refunded") return current;
  const last = events.at(-1);
  if (!last) return current;
  if (last.status === "delivered") return "delivered";
  if (last.status === "label_created") return "label_created";
  return "shipped";
}

/**
 * The order with more scans in its tracking, and its delivery and status brought up to date.
 * A scan it already has is skipped, so two reads catching up at once can't add it twice.
 */
export function withScans(order: Order, scans: TrackingEvent[]): Order {
  if (!order.tracking || scans.length === 0) return order;
  const known = new Set((order.tracking.events ?? []).map((e) => `${e.at}|${e.detail}`));
  const added = scans.filter((e) => !known.has(`${e.at}|${e.detail}`));
  if (added.length === 0) return order;
  const events = [...(order.tracking.events ?? []), ...added].sort((a, b) =>
    a.at.localeCompare(b.at),
  );
  const delivered = events.find((e) => e.status === "delivered");
  return {
    ...order,
    status: statusFromScans(events, order.status),
    tracking: {
      ...order.tracking,
      events,
      deliveredAt: delivered?.at ?? order.tracking.deliveredAt,
    },
  };
}

/**
 * Plays due scans into the given orders and saves what changed; returns the orders as they now
 * are. Pass `preloaded` when the scans were read alongside the orders, to save a round trip.
 */
export async function catchUpScans(
  store: Store,
  shop: Shop,
  orders: Order[],
  now: number,
  preloaded?: PendingScans,
): Promise<Order[]> {
  if (shop.kind !== "sample") return orders;
  const pending = structuredClone(preloaded ?? (await loadPendingScans(store, shop.id)));
  let changed = false;
  const updated = await Promise.all(
    orders.map(async (order) => {
      const waiting = pending[order.id];
      if (!waiting?.length) return order;
      const { past, future } = splitScans(waiting, now);
      if (past.length === 0) return order;
      changed = true;
      if (future.length) pending[order.id] = future;
      else delete pending[order.id];
      const next = withScans(order, past);
      await store.saveOrder(shop.id, next);
      return next;
    }),
  );
  if (changed) await savePendingScans(store, shop.id, pending);
  return updated;
}
