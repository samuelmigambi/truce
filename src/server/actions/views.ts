import "server-only";

import type { CaseResponse, CaseSummary, Metrics, OrderWithChecks } from "@/lib/api-types";
import type { Analysis, Case, Order, Shop } from "@/lib/domain";
import { catchUpScans, loadPendingScans, type PendingScans } from "@/server/demo/scans";
import { log } from "@/server/log";
import { computeMetrics } from "@/server/metrics";
import { PayPalError } from "@/server/paypal/client";
import { markHealthy, markProblem, paypalFor } from "@/server/paypal/connection";
import { syncIfStale } from "@/server/paypal/sync";
import type { Store } from "@/server/store";
import { isBulk, versionOf } from "@/server/store/bulk";
import { ActionError } from "./errors";
import { hasDueReaction, playDueReactions } from "./reactions";
import { sortOrders, withChecks } from "./tracking";

/**
 * What the read routes return. Each read first brings the shop up to date: a connected shop
 * syncs from its PayPal app (at most once a minute), and a sample shop plays the replies and
 * scans that are due.
 * Independent reads go out together, so a page costs one round trip to the database, not several.
 */

/** A connected shop's disputes, synced from its PayPal app at most once a minute. */
async function syncLive(store: Store, shop: Shop, now: Date): Promise<void> {
  if (shop.kind !== "real" || !shop.paypal || shop.status !== "ready") return;
  try {
    const paypal = await paypalFor(store, shop);
    if (!paypal) return;
    const synced = await syncIfStale(store, shop, paypal.client, 60_000, now);
    if (synced) await markHealthy(store, shop, now);
  } catch (error) {
    // Show what's stored; the next read tries PayPal again.
    log.warn("sync.failed", { shopId: shop.id, error });
    if (error instanceof PayPalError && (error.status === 401 || error.status === 403)) {
      await markProblem(
        store,
        shop,
        "PayPal turned Truce away with this app's keys. Check the connection in settings.",
        now,
      ).catch(() => undefined);
    }
  }
}

const noScans = Promise.resolve<PendingScans>({});
const scansFor = (store: Store, shop: Shop) =>
  shop.kind === "sample" ? loadPendingScans(store, shop.id) : noScans;

/** The shop's cases as they stand now. */
export async function currentCases(store: Store, shop: Shop, now = new Date()): Promise<Case[]> {
  await syncLive(store, shop, now);
  return playDueReactions(store, shop, await store.listCases(shop.id), now);
}

/**
 * The shop's cases and orders as they stand now, read at the same time. A reply that's due
 * can refund an order, so when one plays, the orders are read again.
 */
export async function currentRecords(
  store: Store,
  shop: Shop,
  now = new Date(),
): Promise<{ cases: Case[]; orders: Order[] }> {
  await syncLive(store, shop, now);
  const [listed, listedOrders, pending] = await Promise.all([
    store.listCases(shop.id),
    store.listOrders(shop.id),
    scansFor(store, shop),
  ]);
  const replied = hasDueReaction(listed, now);
  const cases = replied ? await playDueReactions(store, shop, listed, now) : listed;
  const orders = replied ? await store.listOrders(shop.id) : listedOrders;
  return { cases, orders: await catchUpScans(store, shop, orders, now.getTime(), pending) };
}

/** Every analysis in the shop: one query where the store can, else one read per case. */
async function analysesOf(
  store: Store,
  shopId: string,
  early: Promise<Analysis[]> | null,
  cases: () => Promise<Case[]>,
): Promise<Analysis[]> {
  if (early) return early;
  const list = await cases();
  const found = await Promise.all(list.map((c) => store.getAnalysis(shopId, c.id)));
  return found.filter((a): a is Analysis => a !== null);
}

/** Open cases by deadline, soonest first; then closed ones, most recent first. */
export function sortCases<T extends Case>(cases: T[]): T[] {
  const due = (c: Case) => (c.dueAt ? Date.parse(c.dueAt) : Number.MAX_SAFE_INTEGER);
  const open = cases
    .filter((c) => c.status !== "closed")
    .sort((a, b) => due(a) - due(b) || a.id.localeCompare(b.id));
  const closed = cases
    .filter((c) => c.status === "closed")
    .sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? "") || a.id.localeCompare(b.id));
  return [...open, ...closed];
}

export function caseSummary(kase: Case, analysis: Analysis | null): CaseSummary {
  const recommendation = analysis
    ? {
        move: analysis.recommendation.move,
        confidence: analysis.recommendation.confidence,
        headline: analysis.recommendation.headline,
      }
    : null;
  return { ...kase, recommendation, analyzed: analysis !== null };
}

export async function caseSummaries(
  store: Store,
  shop: Shop,
  now = new Date(),
): Promise<CaseSummary[]> {
  const listing = currentCases(store, shop, now);
  const early = isBulk(store) ? store.listAnalyses(shop.id) : null;
  const [cases, analyses] = await Promise.all([
    listing,
    analysesOf(store, shop.id, early, () => listing),
  ]);
  const byCase = new Map(analyses.map((a) => [a.caseId, a]));
  return sortCases(cases).map((c) => caseSummary(c, byCase.get(c.id) ?? null));
}

/** One case with its order, its events and the agent's analysis. */
export async function caseFile(
  store: Store,
  shop: Shop,
  caseId: string,
  now = new Date(),
): Promise<CaseResponse> {
  const [stored, pending] = await Promise.all([
    store.getCase(shop.id, caseId),
    scansFor(store, shop),
  ]);
  if (!stored) {
    throw new ActionError(404, "There's no case with that ID in this shop.", {
      code: "case_not_found",
    });
  }
  const [kase] = hasDueReaction([stored], now)
    ? await playDueReactions(store, shop, [stored], now)
    : [stored];
  const [order, events, analysis] = await Promise.all([
    store.getOrder(shop.id, kase!.orderId),
    store.listEvents(shop.id, caseId),
    store.getAnalysis(shop.id, caseId),
  ]);
  const [current] = order
    ? await catchUpScans(store, shop, [order], now.getTime(), pending)
    : [null];
  return { case: kase!, order: current ?? null, events, analysis };
}

/** Every order with its before-shipping checks, those waiting to ship first. */
export async function ordersWithChecks(
  store: Store,
  shop: Shop,
  now = new Date(),
): Promise<OrderWithChecks[]> {
  const { cases, orders } = await currentRecords(store, shop, now);
  return sortOrders(orders).map((o) => withChecks(o, cases));
}

/** Metrics kept a few seconds per shop; any write to the shop starts them again. */
const METRICS_TTL_MS = 5_000;
const metricsCache = new Map<string, { at: number; version: number; value: Metrics }>();

export async function metricsFor(store: Store, shop: Shop, now = new Date()): Promise<Metrics> {
  const version = versionOf(store, shop.id);
  const key = `${shop.id}:${shop.orderHistory}`;
  const hit = metricsCache.get(key);
  if (
    hit &&
    version !== null &&
    hit.version === version &&
    now.getTime() - hit.at < METRICS_TTL_MS
  ) {
    return structuredClone(hit.value);
  }
  const records = currentRecords(store, shop, now);
  const early = isBulk(store) ? store.listAnalyses(shop.id) : null;
  const [{ cases, orders }, analyses] = await Promise.all([
    records,
    analysesOf(store, shop.id, early, async () => (await records).cases),
  ]);
  const value = computeMetrics(
    cases,
    orders,
    analyses,
    now.getTime(),
    shop.orderHistory === "full",
  );
  const settled = versionOf(store, shop.id);
  if (settled !== null) {
    if (metricsCache.size > 500) metricsCache.clear();
    metricsCache.set(key, { at: now.getTime(), version: settled, value });
  }
  return structuredClone(value);
}
