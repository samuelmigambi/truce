import "server-only";

import type { AnalysisEvent, SweepEvent } from "@/lib/api-types";
import type { Case, CaseEvent, Order, Workspace } from "@/lib/domain";
import { shippingChecks } from "@/lib/rules/protection";
import type { Store } from "@/server/store/types";
import { dailySpendCap, gate, spend, type Budget } from "./budget";
import type { AiClient } from "./client";
import { deadline } from "./events";
import { costOf, type Job } from "./models";
import { fingerprint } from "./pipeline/replay";
import { TIMEOUTS } from "./pipeline/run";
import { caseUrgency, fallbackSummary, triageCase, type Triage } from "./pipeline/triage";
import { JsonAnswerError } from "./structured";

/**
 * The overnight check, also run on demand: pull new disputes from PayPal (live workspace), sort
 * every open case that Truce hasn't looked at with Lightning, and check each order waiting to ship
 * against Seller Protection. The overnight job also prepares a full analysis for new cases.
 */

export interface SweepDeps {
  store: Store;
  client: AiClient | null;
  workspace: Workspace;
  budget: Budget;
  models: Record<Job, string>;
  /** Live only: pulls disputes from PayPal and says what changed. */
  sync?: (() => Promise<{ label: string }>) | null;
  /** The overnight job prepares each new case's full analysis; the button only sorts them. */
  analyze?: ((caseId: string) => AsyncIterable<AnalysisEvent>) | null;
  spendCap?: number;
  now?: () => Date;
  signal?: AbortSignal;
}

const TRIAGE_SECONDS = 14 * 24 * 60 * 60;
const AT_ONCE = 3;

/** Runs `work` over `items`, a few at a time, yielding each result as it's ready, in order. */
async function* inBatches<T, R>(
  items: T[],
  size: number,
  work: (item: T) => Promise<R>,
): AsyncGenerator<R> {
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size).map(work);
    for (const result of batch) yield await result;
  }
}

/** The label for an order waiting to ship. */
export function shipLabel(order: Order): { ok: boolean; label: string } {
  const result = shippingChecks(order);
  if (result.covered)
    return { ok: true, label: "Ready to ship: the label matches PayPal's address" };
  const address = result.checks.find((c) => c.id === "address" && !c.ok);
  if (address) {
    return {
      ok: false,
      label:
        "The label address differs from PayPal's, which voids Seller Protection. Truce drafted a note asking the buyer to update it in PayPal.",
    };
  }
  const failing = result.checks.find((c) => !c.ok);
  return { ok: false, label: failing?.label ?? "Fails a Seller Protection check" };
}

interface Sorted {
  kase: Case;
  triage: Triage;
  cost: number | null;
  fresh: boolean;
}

export async function* runSweep(deps: SweepDeps): AsyncGenerator<SweepEvent> {
  const now = deps.now?.() ?? new Date();
  const { store, workspace } = deps;
  const allowed = await gate(deps.budget, "sweep", workspace, deps.spendCap ?? dailySpendCap());
  if (!allowed.ok && allowed.reason === "rate") {
    yield { type: "error", message: allowed.message };
    return;
  }
  // Past the spend cap the check still runs, on the rules alone.
  const client = allowed.ok ? deps.client : null;
  if (!allowed.ok) yield { type: "error", message: allowed.message };

  if (deps.sync) {
    yield { type: "progress", label: "Checking PayPal for new disputes", done: 0, total: 1 };
    try {
      const synced = await deps.sync();
      yield { type: "progress", label: synced.label, done: 1, total: 1 };
    } catch (error) {
      console.error("[sweep] sync failed", error);
      yield {
        type: "error",
        message: "Couldn't reach PayPal just now, so this check covers the cases already here.",
      };
    }
  }

  const [cases, orders] = await Promise.all([
    store.listCases(workspace.id),
    store.listOrders(workspace.id),
  ]);
  const byId = new Map(orders.map((o) => [o.id, o]));
  const open = cases.filter((c) => c.status !== "closed");
  const unread = (
    await Promise.all(
      open.map(async (c) =>
        (await store.getAnalysis(workspace.id, c.id).catch(() => null)) ? null : c,
      ),
    )
  ).filter((c): c is Case => c !== null);

  yield {
    type: "progress",
    label: unread.length
      ? `Sorting ${unread.length} open ${unread.length === 1 ? "case" : "cases"} Truce hasn't read`
      : "Every open case has been read",
    done: 0,
    total: unread.length,
  };
  let done = 0;
  for await (const sorted of inBatches(unread, AT_ONCE, (kase) =>
    sortCase(deps, client, kase, byId.get(kase.orderId) ?? null, now),
  )) {
    done++;
    if (sorted.cost !== null) yield { type: "usage", model: deps.models.fast, cost: sorted.cost };
    yield { type: "case", caseId: sorted.kase.id, summary: sorted.triage.summary };
    yield {
      type: "progress",
      label: `Sorted ${sorted.kase.buyer.name}'s case`,
      done,
      total: unread.length,
    };
  }

  if (deps.analyze && client) {
    let prepared = 0;
    for (const kase of unread) {
      for await (const event of deps.analyze(kase.id)) {
        if (event.type === "usage") yield { type: "usage", model: event.model, cost: event.cost };
        if (event.type === "error")
          yield { type: "error", message: `${kase.buyer.name}'s case: ${event.message}` };
      }
      prepared++;
      yield {
        type: "progress",
        label: `Prepared a recommendation for ${kase.buyer.name}`,
        done: prepared,
        total: unread.length,
      };
    }
  }

  const toShip = orders
    .filter((o) => o.status === "paid" || o.status === "label_created")
    .sort((a, b) => a.placedAt.localeCompare(b.placedAt));
  yield {
    type: "progress",
    label: `Checking ${toShip.length} ${toShip.length === 1 ? "order" : "orders"} before they ship`,
    done: 0,
    total: toShip.length,
  };
  let flagged = 0;
  for (const order of toShip) {
    const { ok, label } = shipLabel(order);
    if (!ok) flagged++;
    yield { type: "order", orderId: order.id, ok, label };
  }

  const latest = (await store.getWorkspace(workspace.id).catch(() => null)) ?? workspace;
  await store.saveWorkspace({ ...latest, lastSweepAt: now.toISOString() });
  yield { type: "done", analyzed: unread.length, flagged };
}

/** One case sorted by Lightning, or read back from an earlier sweep of the same facts. */
async function sortCase(
  deps: SweepDeps,
  client: AiClient | null,
  kase: Case,
  order: Order | null,
  now: Date,
): Promise<Sorted> {
  const { store, workspace } = deps;
  const key = `triage:${workspace.id}:${kase.id}:${fingerprint(kase, order, [])}`;
  const earlier = await store.getCached<Triage>(key).catch(() => null);
  if (earlier) return { kase, triage: earlier, cost: null, fresh: false };

  let triage: Triage = {
    summary: fallbackSummary(kase, order),
    urgency: caseUrgency(kase, now),
    injection: false,
  };
  let cost: number | null = null;
  let answered = false;
  if (client) {
    try {
      const answer = await triageCase(
        client,
        deps.models.fast,
        kase,
        order,
        now,
        deadline(TIMEOUTS.triage.deadline, deps.signal),
      );
      triage = answer.value;
      cost = costOf(deps.models.fast, answer.usage);
      answered = true;
    } catch (error) {
      if (error instanceof JsonAnswerError) cost = error.cost;
      console.error("[sweep] triage failed", kase.id, error);
    }
  }
  await spend(deps.budget, cost);
  // Only the model's read is kept; a plain summary is redone next time.
  if (answered) await store.setCached(key, triage, TRIAGE_SECONDS).catch(() => undefined);
  const note: CaseEvent = {
    id: `sweep-${kase.id}-${now.getTime().toString(36)}`,
    at: now.toISOString(),
    kind: "note",
    actor: "truce",
    title: "Truce sorted this case in the overnight check",
    detail: triage.summary,
  };
  await store
    .addEvent(workspace.id, kase.id, note)
    .catch((error) => console.error("[sweep] couldn't note it", error));
  return { kase, triage, cost, fresh: true };
}
