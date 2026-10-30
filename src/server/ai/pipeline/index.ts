import "server-only";

import type { AnalysisEvent } from "@/lib/api-types";
import type {
  Analysis,
  Case,
  CaseEvent,
  CurrencyCode,
  Move,
  Order,
  OrderFacts,
} from "@/lib/domain";
import { formatMoney } from "@/lib/money";
import { caseProtection, type ProtectionResult } from "@/lib/rules/protection";
import { shopRatio } from "@/server/metrics";
import { dailySpendCap, gate } from "../budget";
import { EventLog, Slots } from "../events";
import { PROMPT_VERSION } from "../prompts";
import { salesKnown } from "../shop";
import { decideStep, weighStep } from "./decide";
import { draftStep } from "./draft";
import { publicRecords } from "./evidence";
import { gatherStep, type Gathered } from "./gather";
import {
  makeRecording,
  RECORDING_SECONDS,
  recordingFits,
  replay,
  replayKey,
  sameFacts,
  type Recording,
} from "./replay";
import { triageStep } from "./triage";
import { Meter, type AnalyzeDeps, type Run } from "./types";
import { verifyStep } from "./verify";

export type { AnalyzeDeps, PhotoReader, WebReader } from "./types";
export { replayKey } from "./replay";
export { triageCase, caseUrgency } from "./triage";

/**
 * The case analysis: triage, gather, protect, weigh, decide, draft, verify and similar, streamed as
 * AnalysisEvents, in the shop's own words, calendar and currency. A sample shop's seeded case that
 * was analyzed before is replayed from its recording; anything else (every real shop's case) runs
 * live on Token Factory within the day's limits. A live run doesn't depend on its reader: it
 * finishes and saves even if the browser goes away, and a second request for the same case
 * follows the run already going.
 */

const running = new Map<string, EventLog<AnalysisEvent>>();

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface Loaded {
  kase: Case;
  order: Order | null;
  closed: Case[];
  cases: Case[];
  orders: Order[];
  now: Date;
}

export async function* analyzeCase(deps: AnalyzeDeps): AsyncGenerator<AnalysisEvent> {
  const { store, shop } = deps;
  const kase = await store.getCase(shop.id, deps.caseId);
  if (!kase) {
    yield { type: "error", message: "That case isn't in this shop." };
    return;
  }
  // One run per case at a time: a second request (a refresh, a second tab) follows it.
  const key = `${shop.id}:${kase.id}`;
  let log = running.get(key);
  if (!log) {
    const own = new EventLog<AnalysisEvent>();
    running.set(key, own);
    void produce(deps, kase, own)
      .catch((error) => {
        console.error("[analysis] failed", error);
        own.push({
          type: "error",
          message: "The analysis stopped partway. Try again in a moment.",
        });
      })
      .finally(() => {
        own.close();
        running.delete(key);
      });
    log = own;
  }
  yield* log.read(deps.signal);
}

/** Decides between a replay and a live run, and writes whichever it is to the run's log. */
async function produce(deps: AnalyzeDeps, kase: Case, log: EventLog<AnalysisEvent>): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const { store, shop } = deps;
  const [order, cases, orders] = await Promise.all([
    store.getOrder(shop.id, kase.orderId),
    store.listCases(shop.id),
    store.listOrders(shop.id),
  ]);
  const closed = cases.filter((c) => c.status === "closed" && c.id !== kase.id);
  const loaded: Loaded = { kase, order, closed, cases, orders, now };

  const recording = await findRecording(deps, loaded);
  if (recording?.fits && !deps.live) return play(deps, recording.rec, loaded, log);

  const allowed = await gate(deps.budget, "analyze", shop, deps.spendCap ?? dailySpendCap());
  if (!allowed.ok) {
    // Over a limit: a recording of the same facts is still better than nothing, if a little older.
    if (recording && !deps.live) return play(deps, recording.rec, loaded, log);
    log.push({ type: "error", message: allowed.message });
    return;
  }
  if (!deps.client) {
    log.push({
      type: "error",
      message: "Truce can't analyze this case right now. Try again in a little while.",
    });
    return;
  }

  if (!LIVE_RUNS.open) {
    const ahead = LIVE_RUNS.queued + LIVE_AT_ONCE;
    log.push({
      type: "step",
      step: "triage",
      state: "start",
      label: `Waiting a moment: ${ahead} other cases are being analyzed`,
    });
  }
  await LIVE_RUNS.take();
  try {
    // The run starts now, with the clock reset, after any time spent waiting.
    await runLive(
      deps,
      log,
      { ...loaded, now: deps.now?.() ?? new Date() },
      recording?.rec ?? null,
    );
  } finally {
    LIVE_RUNS.give();
  }
}

/**
 * Live analyses at once on this server; more wait their turn. A first visit can open every case
 * quickly, and each run makes up to four calls at once, so this keeps a burst well inside Token
 * Factory's limits (600 requests and 400,000 tokens a minute, from its headers on 27 Oct) and
 * keeps each run quick.
 */
export const LIVE_AT_ONCE = 4;
const LIVE_RUNS = new Slots(LIVE_AT_ONCE);

/** Where a run of this case is recorded, if it can be: sample shops' seeded cases only. */
function recordingKey(deps: AnalyzeDeps): string | null {
  const { shop } = deps;
  if (shop.kind !== "sample" || !shop.seedVersion || !deps.seedCaseId) return null;
  return replayKey(shop.seedVersion, deps.seedCaseId, shop);
}

async function findRecording(
  deps: AnalyzeDeps,
  loaded: Loaded,
): Promise<{ rec: Recording; fits: boolean } | null> {
  const key = recordingKey(deps);
  if (!key) return null;
  const rec = await deps.store.getCached<Recording>(key).catch(() => null);
  if (!rec?.timeline || !sameFacts(rec, loaded.kase, loaded.order, loaded.closed, deps.shop))
    return null;
  return {
    rec,
    fits: recordingFits(rec, deps.shop, loaded.kase, loaded.order, loaded.closed, loaded.now),
  };
}

async function play(
  deps: AnalyzeDeps,
  rec: Recording,
  loaded: Loaded,
  log: EventLog<AnalysisEvent>,
): Promise<void> {
  const player = replay(rec, {
    shop: deps.shop,
    kase: loaded.kase,
    order: loaded.order,
    closed: loaded.closed,
    now: loaded.now,
    sleep: deps.sleep ?? wait,
    signal: deps.signal,
  });
  let analysis: Analysis | null = null;
  for (;;) {
    const next = await player.next();
    if (next.done) {
      analysis = next.value;
      break;
    }
    log.push(next.value);
  }
  if (!analysis) return;
  await save(deps, loaded.kase, analysis);
  log.push({ type: "result", analysis, replayed: true });
}

function protectStep(run: Run): ProtectionResult {
  run.emit({ type: "step", step: "protect", state: "start", label: "Checking Seller Protection" });
  const facts: OrderFacts = run.order ?? {
    amount: run.kase.amount,
    protection: null,
    paypalAddress: null,
    shipTo: null,
    tracking: null,
  };
  const protection = caseProtection(run.kase.reason, facts);
  run.emit({
    type: "step",
    step: "protect",
    state: "done",
    label: protection.covered
      ? "Seller Protection covers this case"
      : "Seller Protection doesn't cover this case",
  });
  return protection;
}

function similarStep(run: Run, gathered: Gathered): void {
  const model = run.deps.models.embed;
  run.emit({
    type: "step",
    step: "similar",
    state: "start",
    label: "Finding similar closed cases",
    model,
  });
  if (gathered.similarFailed) {
    run.problems.push("similar");
    run.emit({
      type: "step",
      step: "similar",
      state: "error",
      label: "Couldn't look up similar cases",
      model,
    });
    return;
  }
  const n = gathered.similar.length;
  const label = n
    ? `${n} similar closed ${n === 1 ? "case" : "cases"}`
    : run.closed.length
      ? "No closely similar closed cases"
      : "No closed cases to compare yet";
  run.emit({ type: "step", step: "similar", state: "done", label, model });
}

const RECOMMENDS: Record<Move, (a: Analysis, currency: CurrencyCode) => string> = {
  fight: () => "Truce recommends fighting",
  settle: (a, currency) =>
    `Truce recommends settling for ${formatMoney(a.recommendation.offerAmount ?? 0, currency)}`,
  refund: () => "Truce recommends a refund",
};

/**
 * Saves the analysis, and notes it on the case's timeline: the first one, and any later run that
 * changes the call, so the timeline never shows a move Truce no longer recommends as its last.
 */
async function save(deps: AnalyzeDeps, kase: Case, analysis: Analysis): Promise<void> {
  const { store, shop } = deps;
  const previous = await store.getAnalysis(shop.id, kase.id).catch(() => null);
  await store.saveAnalysis(shop.id, analysis);
  if (previous?.recommendation.move === analysis.recommendation.move) return;
  const event: CaseEvent = {
    id: `analysis-${Date.parse(analysis.createdAt).toString(36)}`,
    at: analysis.createdAt,
    kind: "analysis",
    actor: "truce",
    title: RECOMMENDS[analysis.recommendation.move](analysis, shop.currency),
    detail: analysis.recommendation.headline,
  };
  await store
    .addEvent(shop.id, kase.id, event)
    .catch((error) => console.error("[analysis] couldn't note it", error));
}

async function runLive(
  deps: AnalyzeDeps,
  log: EventLog<AnalysisEvent>,
  loaded: Loaded,
  previous: Recording | null,
): Promise<void> {
  // Where the run starts in the log: a recording leaves out any wait for a slot before it.
  const first = log.size;
  const startedAt = log.elapsed();

  // Gather doesn't need triage, so it starts at once. Its events wait until triage is done, so
  // the steps still read one after another; only the time is saved.
  let holding = true;
  const held: AnalysisEvent[] = [];
  const gatherEvent = (event: AnalysisEvent) =>
    event.type === "tool" ||
    ((event.type === "step" || event.type === "usage" || event.type === "text") &&
      (event.step === "gather" || event.step === "similar"));
  const emit = (event: AnalysisEvent) => {
    if (holding && gatherEvent(event)) held.push(event);
    else log.push(event);
  };
  const run: Run = {
    deps,
    client: deps.client!,
    kase: loaded.kase,
    order: loaded.order,
    closed: loaded.closed,
    ratio: shopRatio(loaded.orders, loaded.cases, loaded.now.getTime(), salesKnown(deps.shop)),
    now: loaded.now,
    emit,
    meter: new Meter(emit, deps.budget),
    problems: [],
  };
  try {
    const gathering = gatherStep(run);
    const triage = await triageStep(run).finally(() => {
      holding = false;
      for (const event of held.splice(0)) log.push(event);
    });
    const gathered = await gathering;
    const protection = protectStep(run);
    const weighed = await weighStep(run, gathered.records, protection);
    const recommendation = await decideStep(run, gathered.records, protection, weighed);
    const drafted = await draftStep(run, gathered.records, gathered, recommendation);
    const verified = await verifyStep(run, gathered.records, drafted, recommendation);
    similarStep(run, gathered);
    await run.meter.settle();

    const analysis: Analysis = {
      caseId: loaded.kase.id,
      createdAt: new Date().toISOString(),
      promptVersion: PROMPT_VERSION,
      triage: { summary: triage.summary, urgency: triage.urgency },
      evidence: publicRecords(gathered.records),
      protection,
      evidenceStrength: weighed.strength,
      options: weighed.options,
      recommendation,
      draft: verified.drafted.draft,
      verification: verified.verification,
      similar: gathered.similar,
      steps: run.meter.steps,
      totalCost: Math.round(run.meter.total() * 1e6) / 1e6,
    };
    await save(deps, loaded.kase, analysis);
    emit({ type: "result", analysis, replayed: false });

    // A clean run of an untouched sample case becomes the recording later visitors watch.
    const key = recordingKey(deps);
    const replaceable =
      !previous ||
      !recordingFits(previous, deps.shop, loaded.kase, loaded.order, loaded.closed, loaded.now);
    if (key && run.problems.length === 0 && replaceable) {
      const recording = makeRecording({
        shop: deps.shop,
        kase: loaded.kase,
        order: loaded.order,
        closed: loaded.closed,
        now: loaded.now,
        timeline: log
          .timeline()
          .slice(first)
          .map((t) => ({ ...t, at: t.at - startedAt })),
        analysis,
      });
      await deps.store
        .setCached(key, recording, RECORDING_SECONDS)
        .catch((error) => console.error("[analysis] couldn't record the run", error));
    }
  } catch (error) {
    console.error("[analysis] failed", error);
    emit({ type: "error", message: "The analysis stopped partway. Try again in a moment." });
  }
}
