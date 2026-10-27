import "server-only";

import type { CaseResponse, CaseSummary, Metrics, OrderWithChecks } from "@/lib/api-types";
import type { Analysis, Case, Order, Workspace } from "@/lib/domain";
import { catchUpScans, loadPendingScans, type PendingScans } from "@/server/demo/scans";
import { computeMetrics } from "@/server/metrics";
import { paypal } from "@/server/paypal";
import { syncIfStale } from "@/server/paypal/sync";
import type { Store } from "@/server/store";
import { isBulk, versionOf } from "@/server/store/bulk";
import { ActionError } from "./errors";
import { hasDueReaction, playDueReactions } from "./reactions";
import { sortOrders, withChecks } from "./tracking";

/**
 * What the read routes return. Each read first brings the workspace up to date: the live sandbox
 * syncs from PayPal (at most once a minute), and demo copies play replies and scans that are due.
 * Independent reads go out together, so a page costs one round trip to the database, not several.
 */

/** The live sandbox's disputes, synced from PayPal at most once a minute. */
async function syncLive(store: Store, workspace: Workspace, now: Date): Promise<void> {
  if (workspace.kind !== "live") return;
  const client = paypal();
  if (!client) return;
  try {
    await syncIfStale(store, workspace, client, 60_000, now);
  } catch (error) {
    // Show what's stored; the next read tries PayPal again.
    console.error("[sync] PayPal sync failed", error);
  }
}

const noScans = Promise.resolve<PendingScans>({});
const scansFor = (store: Store, workspace: Workspace) =>
  workspace.kind === "demo" ? loadPendingScans(store, workspace.id) : noScans;

/** The workspace's cases as they stand now. */
export async function currentCases(
  store: Store,
  workspace: Workspace,
  now = new Date(),
): Promise<Case[]> {
  await syncLive(store, workspace, now);
  return playDueReactions(store, workspace.id, await store.listCases(workspace.id), now);
}

/**
 * The workspace's cases and orders as they stand now, read at the same time. A reply that's due
 * can refund an order, so when one plays, the orders are read again.
 */
export async function currentRecords(
  store: Store,
  workspace: Workspace,
  now = new Date(),
): Promise<{ cases: Case[]; orders: Order[] }> {
  await syncLive(store, workspace, now);
  const [listed, listedOrders, pending] = await Promise.all([
    store.listCases(workspace.id),
    store.listOrders(workspace.id),
    scansFor(store, workspace),
  ]);
  const replied = hasDueReaction(listed, now);
  const cases = replied ? await playDueReactions(store, workspace.id, listed, now) : listed;
  const orders = replied ? await store.listOrders(workspace.id) : listedOrders;
  return { cases, orders: await catchUpScans(store, workspace, orders, now.getTime(), pending) };
}

/** Every analysis in the workspace: one query where the store can, else one read per case. */
async function analysesOf(
  store: Store,
  workspaceId: string,
  early: Promise<Analysis[]> | null,
  cases: () => Promise<Case[]>,
): Promise<Analysis[]> {
  if (early) return early;
  const list = await cases();
  const found = await Promise.all(list.map((c) => store.getAnalysis(workspaceId, c.id)));
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
  workspace: Workspace,
  now = new Date(),
): Promise<CaseSummary[]> {
  const listing = currentCases(store, workspace, now);
  const early = isBulk(store) ? store.listAnalyses(workspace.id) : null;
  const [cases, analyses] = await Promise.all([
    listing,
    analysesOf(store, workspace.id, early, () => listing),
  ]);
  const byCase = new Map(analyses.map((a) => [a.caseId, a]));
  return sortCases(cases).map((c) => caseSummary(c, byCase.get(c.id) ?? null));
}

/** One case with its order, its events and the agent's analysis. */
export async function caseFile(
  store: Store,
  workspace: Workspace,
  caseId: string,
  now = new Date(),
): Promise<CaseResponse> {
  const [stored, pending] = await Promise.all([
    store.getCase(workspace.id, caseId),
    scansFor(store, workspace),
  ]);
  if (!stored) throw new ActionError(404, "There's no case with that ID here.");
  const [kase] = hasDueReaction([stored], now)
    ? await playDueReactions(store, workspace.id, [stored], now)
    : [stored];
  const [order, events, analysis] = await Promise.all([
    store.getOrder(workspace.id, kase!.orderId),
    store.listEvents(workspace.id, caseId),
    store.getAnalysis(workspace.id, caseId),
  ]);
  const [current] = order
    ? await catchUpScans(store, workspace, [order], now.getTime(), pending)
    : [null];
  return { case: kase!, order: current ?? null, events, analysis };
}

/** Every order with its before-shipping checks, those waiting to ship first. */
export async function ordersWithChecks(
  store: Store,
  workspace: Workspace,
  now = new Date(),
): Promise<OrderWithChecks[]> {
  const { cases, orders } = await currentRecords(store, workspace, now);
  return sortOrders(orders).map((o) => withChecks(o, cases));
}

/** Metrics kept a few seconds per workspace; any write to the workspace starts them again. */
const METRICS_TTL_MS = 5_000;
const metricsCache = new Map<string, { at: number; version: number; value: Metrics }>();

export async function metricsFor(
  store: Store,
  workspace: Workspace,
  now = new Date(),
): Promise<Metrics> {
  const version = versionOf(store, workspace.id);
  const hit = metricsCache.get(workspace.id);
  if (
    hit &&
    version !== null &&
    hit.version === version &&
    now.getTime() - hit.at < METRICS_TTL_MS
  ) {
    return structuredClone(hit.value);
  }
  const records = currentRecords(store, workspace, now);
  const early = isBulk(store) ? store.listAnalyses(workspace.id) : null;
  const [{ cases, orders }, analyses] = await Promise.all([
    records,
    analysesOf(store, workspace.id, early, async () => (await records).cases),
  ]);
  const value = computeMetrics(cases, orders, analyses, now.getTime());
  const settled = versionOf(store, workspace.id);
  if (settled !== null) {
    if (metricsCache.size > 500) metricsCache.clear();
    metricsCache.set(workspace.id, { at: now.getTime(), version: settled, value });
  }
  return structuredClone(value);
}
