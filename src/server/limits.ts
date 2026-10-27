import "server-only";

import { getStore, type Store } from "@/server/store";

/**
 * Limits that keep the hosted demo affordable through judging: per-workspace rate limits, and one
 * daily cap on model spend across every visitor. Past the cap, cached runs replay instead.
 */

const DAY_SECONDS = 24 * 60 * 60;
const SPEND_KEY = "spend:models";
/** Spend is counted in millionths of a dollar, so many small sums never drift. */
const MICRO = 1_000_000;

/** True while `key` is within `limit` calls in the current window; each call counts once. */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  store: Store = getStore(),
): Promise<boolean> {
  const count = await store.increment(`rate:${key}`, 1, windowSeconds);
  return count <= limit;
}

/** Adds model spend in dollars to today's total (UTC) and returns the new total. */
export async function addSpend(dollars: number, store: Store = getStore()): Promise<number> {
  const micros = Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * MICRO) : 0;
  return (await store.increment(SPEND_KEY, micros, DAY_SECONDS)) / MICRO;
}

/** Today's model spend in dollars, across all workspaces. */
export async function spendToday(store: Store = getStore()): Promise<number> {
  return (await store.increment(SPEND_KEY, 0, DAY_SECONDS)) / MICRO;
}

/** The daily cap in dollars, from TRUCE_DAILY_SPEND_CAP; $5 unless it's set to a positive number. */
export function dailySpendCap(env: Record<string, string | undefined> = process.env): number {
  const cap = Number(env.TRUCE_DAILY_SPEND_CAP);
  return Number.isFinite(cap) && cap > 0 ? cap : 5;
}

/** True once today's spend has reached the cap: replay cached runs only. */
export async function spendCapReached(store: Store = getStore()): Promise<boolean> {
  return (await spendToday(store)) >= dailySpendCap();
}
