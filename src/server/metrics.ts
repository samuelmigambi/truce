import "server-only";

import type { Metrics } from "@/lib/api-types";
import type { Analysis, Case, Order } from "@/lib/domain";
import { claimsRatio } from "@/lib/rules/ratio";
import type { Store } from "@/server/store";
import { allAnalyses } from "@/server/store/bulk";

/**
 * The shop's health in numbers: money at risk, what was kept and avoided in fees, the claims ratio
 * against PayPal's 1.5% line, disputes by week, plain patterns in what buyers say, and what the
 * models cost. Every figure is computed here from the records; the model only explains them.
 */

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

/**
 * Claims over sales in the last 90 days: PayPal's three-month view. Without the shop's sales
 * (`salesKnown` false: Truce only sees the orders that have disputes) there's no ratio to give,
 * so it says so rather than dividing the claims by the disputed orders alone.
 */
export function shopRatio(
  orders: Order[],
  cases: Case[],
  now: number,
  salesKnown = true,
): Metrics["ratio"] {
  const since = now - 90 * DAY;
  const claims = cases.filter(
    (c) => c.stage !== "inquiry" && inWindow(c.openedAt, since, now),
  ).length;
  if (!salesKnown) {
    return { sales: 0, claims, ratio: 0, highVolume: false, headroom: 0, known: false };
  }
  const sales = orders.filter((o) => inWindow(o.placedAt, since, now)).length;
  return { sales, claims, ...claimsRatio(sales, claims), known: true };
}

function inWindow(at: string, since: number, now: number): boolean {
  const t = Date.parse(at);
  return t > since && t <= now;
}

/** Monday 00:00 UTC of the week holding `at`. */
export function weekStart(at: number): number {
  const day = new Date(at).getUTCDay();
  const midnight = Math.floor(at / DAY) * DAY;
  return midnight - ((day + 6) % 7) * DAY;
}

/** Disputes opened per week by reason, the last 13 weeks, oldest first. */
export function weeklyByReason(cases: Case[], now: number): Metrics["weekly"] {
  const current = weekStart(now);
  const weeks = Array.from({ length: 13 }, (_, i) => current - (12 - i) * WEEK);
  return weeks.map((start) => {
    const bucket = {
      weekStart: new Date(start).toISOString(),
      not_received: 0,
      not_as_described: 0,
      unauthorized: 0,
      other: 0,
    };
    for (const c of cases) {
      const opened = Date.parse(c.openedAt);
      if (opened >= start && opened < start + WEEK) bucket[c.reason]++;
    }
    return bucket;
  });
}

const SIZE_WORDS =
  /\b(small|smaller|tiny|size|bigger|larger|inch|inches|tall|measure|measurements)\b/i;
const DAMAGE_WORDS = /\b(cracked|crack|broken|shattered|chipped|damaged|leaking|in pieces)\b/i;

/** What the buyer said: the opening claim and every later buyer message. */
function buyerWords(c: Case): string {
  return [c.buyerClaim, ...c.messages.filter((m) => m.from === "buyer").map((m) => m.text)].join(
    " ",
  );
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const names = (cases: Case[]) => [...new Set(cases.map((c) => c.itemSummary))].join(", ");

/**
 * Plain observations from the last 90 days of disputes, by fixed rules: size complaints, breakage,
 * "not received" parcels that tracking shows delivered, and repeat unauthorized claims.
 */
export function findPatterns(cases: Case[], orders: Order[], now: number): Metrics["patterns"] {
  const since = now - 90 * DAY;
  const recent = cases.filter((c) => inWindow(c.openedAt, since, now));
  const byId = new Map(orders.map((o) => [o.id, o]));
  const patterns: (Metrics["patterns"][number] & { weight: number })[] = [];

  const size = recent.filter(
    (c) => c.reason === "not_as_described" && SIZE_WORDS.test(buyerWords(c)),
  );
  if (size.length >= 2) {
    const settled = size.filter((c) => c.outcome === "settled").length;
    const tail =
      settled > 0
        ? `; ${settled} ${plural(settled, "was", "were")} settled with a partial refund`
        : "";
    patterns.push({
      text: `${size.length} "not as described" cases in the last 90 days say the candle was smaller than expected (${names(size)})${tail}. Add measurements to the photos, not just the listing.`,
      caseIds: size.map((c) => c.id),
      weight: size.length + 1,
    });
  }

  const damage = recent.filter((c) => DAMAGE_WORDS.test(buyerWords(c)));
  if (damage.length >= 2) {
    patterns.push({
      text: `${damage.length} cases in the last 90 days say the order arrived broken (${names(damage)}). Pack stoneware and glass with more padding, and photograph each parcel before it ships.`,
      caseIds: damage.map((c) => c.id),
      weight: damage.length,
    });
  }

  const delivered = recent.filter(
    (c) => c.reason === "not_received" && byId.get(c.orderId)?.tracking?.deliveredAt,
  );
  if (delivered.length >= 2) {
    const closed = delivered.filter((c) => c.outcome === "buyer_closed").length;
    const tail =
      closed > 0
        ? `; ${closed} ${plural(closed, "buyer", "buyers")} closed the case after seeing the tracking`
        : "";
    patterns.push({
      text: `${delivered.length} "not received" cases in the last 90 days were delivered according to USPS${tail}. Reply with the tracking and the delivery scan first.`,
      caseIds: delivered.map((c) => c.id),
      weight: delivered.length,
    });
  }

  const unauthorized = recent.filter((c) => c.reason === "unauthorized");
  if (unauthorized.length >= 2) {
    patterns.push({
      text: `${unauthorized.length} unauthorized claims in the last 90 days. Shipping only to the address on the PayPal payment keeps them covered by Seller Protection.`,
      caseIds: unauthorized.map((c) => c.id),
      weight: unauthorized.length,
    });
  }

  return patterns
    .sort((a, b) => b.weight - a.weight)
    .map(({ text, caseIds }) => ({ text, caseIds }));
}

/** Model spend from saved analyses, by model; the average cost of an analyzed case. */
export function modelSpend(analyses: Analysis[]): Pick<Metrics, "spend" | "averageCaseCost"> {
  const byModel = new Map<string, { model: string; calls: number; cost: number }>();
  for (const analysis of analyses) {
    for (const step of analysis.steps) {
      const entry = byModel.get(step.model) ?? { model: step.model, calls: 0, cost: 0 };
      entry.calls++;
      entry.cost += step.cost ?? 0;
      byModel.set(step.model, entry);
    }
  }
  const spend = [...byModel.values()]
    .map((s) => ({ ...s, cost: round(s.cost) }))
    .sort((a, b) => b.cost - a.cost || a.model.localeCompare(b.model));
  const averageCaseCost =
    analyses.length > 0
      ? round(analyses.reduce((sum, a) => sum + a.totalCost, 0) / analyses.length)
      : null;
  return { spend, averageCaseCost };
}

const round = (dollars: number) => Math.round(dollars * 1e6) / 1e6;

/** Every dashboard number, from the records as they stand at `now`. */
export function computeMetrics(
  cases: Case[],
  orders: Order[],
  analyses: Analysis[],
  now: number,
  salesKnown = true,
): Metrics {
  const open = cases.filter((c) => c.status !== "closed");
  const monthAgo = now - 30 * DAY;
  const closedRecently = cases.filter(
    (c) => c.status === "closed" && c.closedAt && inWindow(c.closedAt, monthAgo, now),
  );
  const sum = (list: Case[], pick: (c: Case) => number) =>
    list.reduce((total, c) => total + pick(c), 0);
  return {
    moneyAtRisk: sum(open, (c) => c.amount),
    openCases: open.length,
    dueSoon: open.filter((c) => c.dueAt && Date.parse(c.dueAt) <= now + 7 * DAY).length,
    kept: sum(closedRecently, (c) => c.moneyKept),
    feesAvoided: sum(closedRecently, (c) => c.feeAvoided),
    feesPaid: sum(closedRecently, (c) => c.feeCharged),
    ratio: shopRatio(orders, cases, now, salesKnown),
    weekly: weeklyByReason(cases, now),
    patterns: findPatterns(cases, orders, now),
    ...modelSpend(analyses),
  };
}

/** Reads what the metrics need from the store, all at once. */
export async function shopMetrics(
  store: Store,
  shopId: string,
  now: number,
  options: { salesKnown?: boolean; cases?: Case[]; orders?: Order[] } = {},
): Promise<Metrics> {
  const [cases, orders] = await Promise.all([
    options.cases ?? store.listCases(shopId),
    options.orders ?? store.listOrders(shopId),
  ]);
  const analyses = await allAnalyses(store, shopId, cases);
  return computeMetrics(cases, orders, analyses, now, options.salesKnown ?? true);
}
