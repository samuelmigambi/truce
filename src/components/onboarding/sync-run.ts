"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { AnalysisEvent, SyncEvent, SyncStepId } from "@/lib/api-types";
import { errorMessage, openStream, shopApi } from "@/lib/client/api";
import { STEPS as ANALYSIS_STEPS } from "@/lib/client/labels";
import type { AnalysisStepId, CaseStatus, DisputeReason } from "@/lib/domain";
import type { Cents } from "@/lib/money";
import { readEvents } from "@/lib/sse";

/**
 * The first sync, reduced from its SyncEvent stream: the sync's own steps, the disputes as they
 * arrive, and the first analysis running inside it. The stream lives outside React, started
 * from a click, so a re-render or a strict-mode remount never starts a second one.
 */

export type SyncStepState = "pending" | "active" | "done" | "error" | "skipped";

export interface SyncStepRun {
  id: SyncStepId;
  state: SyncStepState;
  label: string;
  detail?: string;
  progress?: { done: number; total: number };
}

export interface FoundCase {
  caseId: string;
  buyer: string;
  amount: Cents;
  reason: DisputeReason;
  status: CaseStatus;
  itemSummary: string;
}

export interface AnalysisStepRun {
  id: AnalysisStepId;
  state: "pending" | "active" | "done" | "error";
  label: string;
  model?: string;
}

export interface FirstAnalysis {
  caseId: string;
  status: "running" | "done" | "error";
  steps: AnalysisStepRun[];
  tools: { id: string; label: string; state: "start" | "done" | "error" }[];
  /** The reply as the model writes it. */
  draft: string;
  error: string | null;
}

export type SyncResult = Extract<SyncEvent, { type: "done" }>;

export interface SyncRun {
  status: "running" | "done" | "error";
  steps: SyncStepRun[];
  cases: FoundCase[];
  analysis: FirstAnalysis | null;
  result: SyncResult | null;
  error: string | null;
  startedAt: number;
  endedAt: number | null;
}

/** The sync's steps before the server names them. */
export const SYNC_STEPS: { id: SyncStepId; label: string }[] = [
  { id: "paypal", label: "Check the PayPal connection" },
  { id: "disputes", label: "Find your disputes" },
  { id: "orders", label: "Fill in their orders" },
  { id: "history", label: "Read your order history" },
  { id: "sort", label: "Sort the cases by deadline" },
  { id: "analysis", label: "Analyze the most urgent case" },
];

function freshRun(at: number): SyncRun {
  return {
    status: "running",
    steps: SYNC_STEPS.map((step) => ({ id: step.id, state: "pending", label: step.label })),
    cases: [],
    analysis: null,
    result: null,
    error: null,
    startedAt: at,
    endedAt: null,
  };
}

function freshAnalysis(caseId: string): FirstAnalysis {
  return {
    caseId,
    status: "running",
    steps: ANALYSIS_STEPS.map((step) => ({ id: step.id, state: "pending", label: step.label })),
    tools: [],
    draft: "",
    error: null,
  };
}

export function reduceAnalysis(
  current: FirstAnalysis | null,
  caseId: string,
  event: AnalysisEvent,
): FirstAnalysis {
  const run = current && current.caseId === caseId ? current : freshAnalysis(caseId);
  switch (event.type) {
    case "step": {
      const state: AnalysisStepRun["state"] =
        event.state === "start" ? "active" : event.state === "done" ? "done" : "error";
      const known = run.steps.some((step) => step.id === event.step);
      const steps = known
        ? run.steps.map((step) =>
            step.id === event.step
              ? {
                  ...step,
                  state,
                  label: event.label || step.label,
                  model: event.model ?? step.model,
                }
              : step,
          )
        : [...run.steps, { id: event.step, state, label: event.label, model: event.model }];
      return { ...run, steps };
    }
    case "tool": {
      const tool = { id: event.id, label: event.label, state: event.state };
      const tools = run.tools.some((t) => t.id === event.id)
        ? run.tools.map((t) => (t.id === event.id ? tool : t))
        : [...run.tools, tool];
      return { ...run, tools };
    }
    case "usage":
      return {
        ...run,
        steps: run.steps.map((step) =>
          step.id === event.step ? { ...step, model: step.model ?? event.model } : step,
        ),
      };
    case "text":
      return event.step === "draft" ? { ...run, draft: run.draft + event.delta } : run;
    case "result":
      return {
        ...run,
        status: "done",
        steps: run.steps.map((step) =>
          step.state === "active" ? { ...step, state: "done" } : step,
        ),
      };
    case "error":
      return {
        ...run,
        status: "error",
        error: event.message,
        steps: run.steps.map((step) =>
          step.state === "active" ? { ...step, state: "error" } : step,
        ),
      };
  }
}

export function reduceSync(run: SyncRun, event: SyncEvent, at: number): SyncRun {
  switch (event.type) {
    case "step":
      return {
        ...run,
        steps: run.steps.map((step) =>
          step.id === event.step
            ? {
                ...step,
                state: event.state === "start" ? "active" : event.state,
                label: event.label || step.label,
                detail: event.detail ?? (event.state === "start" ? undefined : step.detail),
              }
            : step,
        ),
      };
    case "progress":
      return {
        ...run,
        steps: run.steps.map((step) =>
          step.id === event.step
            ? {
                ...step,
                state: step.state === "pending" ? "active" : step.state,
                progress: { done: event.done, total: event.total },
              }
            : step,
        ),
      };
    case "case": {
      const found: FoundCase = {
        caseId: event.caseId,
        buyer: event.buyer,
        amount: event.amount,
        reason: event.reason,
        status: event.status,
        itemSummary: event.itemSummary,
      };
      const cases = run.cases.some((c) => c.caseId === found.caseId)
        ? run.cases.map((c) => (c.caseId === found.caseId ? found : c))
        : [...run.cases, found];
      return { ...run, cases };
    }
    case "analysis":
      return { ...run, analysis: reduceAnalysis(run.analysis, event.caseId, event.event) };
    case "done":
      return {
        ...run,
        status: "done",
        result: event,
        endedAt: at,
        steps: run.steps.map((step) =>
          step.state === "active"
            ? { ...step, state: "done" }
            : step.state === "pending"
              ? { ...step, state: "skipped" }
              : step,
        ),
      };
    case "error":
      return {
        ...run,
        status: "error",
        error: event.message,
        endedAt: at,
        steps: run.steps.map((step) =>
          step.state === "active" ? { ...step, state: "error" } : step,
        ),
      };
  }
}

const STOPPED = "The sync stopped before it finished. Try again.";

/** One page's sync stream: start it, read it, stop it. */
function createSyncStream() {
  let run: SyncRun | null = null;
  let controller: AbortController | null = null;
  const listeners = new Set<() => void>();

  function set(next: SyncRun | null) {
    run = next;
    for (const listener of listeners) listener();
  }

  function update(event: SyncEvent) {
    if (run) set(reduceSync(run, event, Date.now()));
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: () => run,
    stop() {
      controller?.abort();
      controller = null;
    },
    start(shopId: string) {
      if (run?.status === "running") return;
      controller?.abort();
      const own = new AbortController();
      controller = own;
      set(freshRun(Date.now()));
      void (async () => {
        try {
          const response = await openStream(shopApi(shopId, "sync"), {}, own.signal);
          let finished = false;
          for await (const event of readEvents<SyncEvent>(response, own.signal)) {
            update(event);
            if (event.type === "done" || event.type === "error") finished = true;
          }
          if (!finished && !own.signal.aborted) update({ type: "error", message: STOPPED });
        } catch (error) {
          if (!own.signal.aborted) update({ type: "error", message: errorMessage(error) });
        } finally {
          if (controller === own) controller = null;
        }
      })();
    },
  };
}

/** The page's first sync: `run` is null until it starts. */
export function useSyncStream() {
  const [stream] = useState(createSyncStream);
  const run = useSyncExternalStore(stream.subscribe, stream.get, () => null);
  useEffect(() => () => stream.stop(), [stream]);
  return { run, start: stream.start };
}
