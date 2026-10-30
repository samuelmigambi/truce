import "server-only";

import type { Analysis, Case, CaseEvent, Order, Shop } from "@/lib/domain";
import type { Store } from "./types";

/**
 * What Truce's own stores can do beyond the Store contract, where it saves round trips: write a
 * whole shop's records in one go (seeding a sample shop) and read every analysis in one query.
 * It's optional, so other Store implementations (such as test fakes) still fit.
 */

/** Everything one shop holds, written at once when a sample shop is seeded. */
export interface ShopData {
  shop: Shop;
  orders: Order[];
  cases: Case[];
  /** Each case's events. */
  events: Record<string, CaseEvent[]>;
  /** Shared cache entries that belong with it, such as the sample shop's pending scans. */
  cache?: { key: string; value: unknown; ttlSeconds?: number }[];
  /** Keep the shop's notifications through a reseed. */
  keepNotifications?: boolean;
}

export interface BulkStore {
  /**
   * Replaces the shop's records with these, removing any others (analyses included).
   * `fresh` says the shop is brand new, so there's nothing to remove.
   */
  replaceShop(data: ShopData, fresh: boolean): Promise<void>;
  listAnalyses(shopId: string): Promise<Analysis[]>;
}

/**
 * A store that works a sample shop's seed out on read, from the seed's day, instead of keeping
 * the seeded records; only what changes afterwards is stored.
 */
export interface SeedOnRead {
  readonly seedsOnRead: true;
}

export function seedsOnRead(store: Store): boolean {
  return (store as Partial<SeedOnRead>).seedsOnRead === true;
}

/** A count that goes up with every write to a shop, for caches that live in this process. */
export interface Versioned {
  version(shopId: string): number;
}

export function isBulk(store: Store): store is Store & BulkStore {
  return typeof (store as Partial<BulkStore>).replaceShop === "function";
}

/** The shop's write count, or null when the store doesn't keep one. */
export function versionOf(store: Store, shopId: string): number | null {
  const versioned = store as Partial<Versioned>;
  return typeof versioned.version === "function" ? versioned.version(shopId) : null;
}

/** Every analysis in the shop: one query where the store can, one read per case otherwise. */
export async function allAnalyses(
  store: Store,
  shopId: string,
  cases: Case[],
): Promise<Analysis[]> {
  if (isBulk(store)) return store.listAnalyses(shopId);
  const found = await Promise.all(cases.map((c) => store.getAnalysis(shopId, c.id)));
  return found.filter((a): a is Analysis => a !== null);
}
