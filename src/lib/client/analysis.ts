"use client";

import { mutate } from "swr";
import type { AnalysisEvent, CaseResponse } from "@/lib/api-types";
import type { Analysis, AnalysisStepId } from "@/lib/domain";
import { readEvents } from "@/lib/sse";
import { errorMessage, openStream, shopApi } from "./api";
import { keys } from "./hooks";
import { STEPS } from "./labels";
import { createStore, useStore } from "./store";

/**
 * Live analysis runs, reduced from the AnalysisEvent stream, kept per shop and then per case.
 * Sample shops share case IDs, so a run always belongs to one shop. A run keeps going if the
 * seller leaves the case file; the inbox shows it as "Analyzing".
 */

export interface ToolRun {
  id: string;
  label: string;
  state: "start" | "done" | "error";
}

export interface UsageRun {
  model: string;
  input: number;
  output: number;
  cached: number;
  cost: number | null;
}

export interface StepRun {
  id: AnalysisStepId;
  state: "pending" | "active" | "done" | "error";
  label: string;
  model?: string;
  tools: ToolRun[];
  usage: UsageRun[];
  startedAt?: number;
  endedAt?: number;
}

export interface AnalysisRun {
  caseId: string;
  status: "running" | "done" | "error";
  steps: StepRun[];
  /** Text as the models write it, by step: the draft streams in here. */
  text: Partial<Record<AnalysisStepId, string>>;
  result: Analysis | null;
  replayed: boolean;
  error: string | null;
  startedAt: number;
  endedAt: number | null;
  /** Dollars so far. */
  cost: number;
}

/** One shop's runs, by case. */
export type ShopRuns = Record<string, AnalysisRun>;

const runs = createStore<Record<string, ShopRuns>>({});
const controllers = new Map<string, AbortController>();
const NONE: ShopRuns = {};

const controllerKey = (shopId: string, caseId: string) => `${shopId}\n${caseId}`;

function freshRun(caseId: string, startedAt = Date.now()): AnalysisRun {
  return {
    caseId,
    status: "running",
    steps: STEPS.map((s) => ({ id: s.id, state: "pending", label: s.label, tools: [], usage: [] })),
    text: {},
    result: null,
    replayed: false,
    error: null,
    startedAt,
    endedAt: null,
    cost: 0,
  };
}

/** A run about to start, for the moment before it does: every step still to come. */
export function waitingRun(caseId: string): AnalysisRun {
  return freshRun(caseId, 0);
}

function setRun(shopId: string, caseId: string, run: AnalysisRun | null) {
  runs.set((all) => {
    const shop = { ...(all[shopId] ?? NONE) };
    if (run) shop[caseId] = run;
    else delete shop[caseId];
    return { ...all, [shopId]: shop };
  });
}

function updateRun(shopId: string, caseId: string, update: (run: AnalysisRun) => AnalysisRun) {
  runs.set((all) => {
    const run = all[shopId]?.[caseId];
    return run ? { ...all, [shopId]: { ...all[shopId], [caseId]: update(run) } } : all;
  });
}

function updateStep(
  run: AnalysisRun,
  id: AnalysisStepId,
  update: (step: StepRun) => StepRun,
): AnalysisRun {
  const known = run.steps.some((s) => s.id === id);
  const steps = known
    ? run.steps.map((s) => (s.id === id ? update(s) : s))
    : [...run.steps, update({ id, state: "pending", label: id, tools: [], usage: [] })];
  return { ...run, steps };
}

/** Tools belong to the step that's running when they start. */
function activeStepId(run: AnalysisRun): AnalysisStepId | null {
  for (let i = run.steps.length - 1; i >= 0; i--) {
    const step = run.steps[i];
    if (step?.state === "active") return step.id;
  }
  return null;
}

export function reduceAnalysis(run: AnalysisRun, event: AnalysisEvent, at: number): AnalysisRun {
  switch (event.type) {
    case "step":
      return updateStep(run, event.step, (s) => ({
        ...s,
        state: event.state === "start" ? "active" : event.state === "done" ? "done" : "error",
        label: event.label || s.label,
        model: event.model ?? s.model,
        startedAt: event.state === "start" ? at : (s.startedAt ?? at),
        endedAt: event.state === "start" ? undefined : at,
      }));
    case "tool": {
      const stepId = activeStepId(run) ?? "gather";
      return updateStep(run, stepId, (s) => {
        const exists = s.tools.some((t) => t.id === event.id);
        const tool = { id: event.id, label: event.label, state: event.state };
        return {
          ...s,
          tools: exists ? s.tools.map((t) => (t.id === event.id ? tool : t)) : [...s.tools, tool],
        };
      });
    }
    case "usage": {
      const next = updateStep(run, event.step, (s) => ({
        ...s,
        model: s.model ?? event.model,
        usage: [
          ...s.usage,
          {
            model: event.model,
            input: event.input,
            output: event.output,
            cached: event.cached,
            cost: event.cost,
          },
        ],
      }));
      return { ...next, cost: next.cost + (event.cost ?? 0) };
    }
    case "text":
      return {
        ...run,
        text: { ...run.text, [event.step]: (run.text[event.step] ?? "") + event.delta },
      };
    case "result":
      return {
        ...run,
        status: "done",
        result: event.analysis,
        replayed: event.replayed,
        endedAt: at,
        steps: run.steps.map((s) =>
          s.state === "active" ? { ...s, state: "done", endedAt: at } : s,
        ),
      };
    case "error":
      return {
        ...run,
        status: "error",
        error: event.message,
        endedAt: at,
        steps: run.steps.map((s) =>
          s.state === "active" ? { ...s, state: "error", endedAt: at } : s,
        ),
      };
  }
}

/**
 * Starts an analysis for a case, unless one is already running. `live` asks for a fresh run
 * instead of a replay of the recorded one (sample shops only; real shops always run live).
 */
export function startAnalysis(shopId: string, caseId: string, options: { live?: boolean } = {}) {
  if (runs.get()[shopId]?.[caseId]?.status === "running") return;
  const key = controllerKey(shopId, caseId);
  const controller = new AbortController();
  controllers.set(key, controller);
  setRun(shopId, caseId, freshRun(caseId));
  void (async () => {
    try {
      const response = await openStream(
        shopApi(
          shopId,
          `cases/${encodeURIComponent(caseId)}/analyze${options.live ? "?live=1" : ""}`,
        ),
        {},
        controller.signal,
      );
      let finished = false;
      for await (const event of readEvents<AnalysisEvent>(response, controller.signal)) {
        updateRun(shopId, caseId, (run) => reduceAnalysis(run, event, Date.now()));
        if (event.type === "result") {
          finished = true;
          const analysis = event.analysis;
          await mutate<CaseResponse>(
            keys.case(shopId, caseId),
            (data) => (data ? { ...data, analysis } : data),
            { revalidate: true },
          );
          void mutate(keys.cases(shopId));
          void mutate(keys.metrics(shopId));
        }
        if (event.type === "error") finished = true;
      }
      if (!finished && !controller.signal.aborted) {
        updateRun(shopId, caseId, (run) =>
          reduceAnalysis(
            run,
            { type: "error", message: "The analysis stopped before it finished. Try again." },
            Date.now(),
          ),
        );
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      updateRun(shopId, caseId, (run) =>
        reduceAnalysis(run, { type: "error", message: errorMessage(error) }, Date.now()),
      );
    } finally {
      if (controllers.get(key) === controller) controllers.delete(key);
    }
  })();
}

export function cancelAnalysis(shopId: string, caseId: string) {
  const key = controllerKey(shopId, caseId);
  controllers.get(key)?.abort();
  controllers.delete(key);
  setRun(shopId, caseId, null);
}

/** Forgets a finished run, so the case file shows the saved analysis. */
export function clearAnalysis(shopId: string, caseId: string) {
  if (runs.get()[shopId]?.[caseId]?.status === "running") return;
  cancelAnalysis(shopId, caseId);
}

/** Stops and forgets every run in a shop: after it starts over, or once it's deleted. */
export function forgetAnalyses(shopId: string) {
  for (const [key, controller] of controllers) {
    if (key.startsWith(`${shopId}\n`)) {
      controller.abort();
      controllers.delete(key);
    }
  }
  runs.set((all) => {
    if (!all[shopId]) return all;
    const rest = { ...all };
    delete rest[shopId];
    return rest;
  });
}

export function useAnalysisRun(shopId: string, caseId: string): AnalysisRun | null {
  return useStore(runs, (all) => all[shopId]?.[caseId] ?? null);
}

/** The shop's runs by case, including the ones streaming right now. */
export function useRunningAnalyses(shopId: string): ShopRuns {
  return useStore(runs, (all) => all[shopId] ?? NONE);
}
