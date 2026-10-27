import "server-only";

import type { AnalysisStepId } from "@/lib/domain";
import { deadline } from "../events";
import type { Usage } from "../models";
import { JsonAnswerError } from "../structured";
import type { Run } from "./types";

/**
 * Each step's deadline, and how long one attempt may take inside it. Typical calls take 1–9 s;
 * the room above that is for a busy moment, and a hung attempt is retried rather than using up
 * its step. Every step has its own clock, so one slow step never eats into the next one's time.
 */
export const TIMEOUTS = {
  triage: { deadline: 40_000, attempt: 15_000 },
  gather: { deadline: 60_000, attempt: 20_000 },
  photo: { deadline: 45_000, attempt: 30_000 },
  embed: { deadline: 30_000, attempt: 12_000 },
  weigh: { deadline: 40_000, attempt: 15_000 },
  decide: { deadline: 100_000, attempt: 60_000 },
  draft: { deadline: 75_000, attempt: 40_000 },
  verify: { deadline: 60_000, attempt: 25_000 },
  repair: { deadline: 60_000, attempt: 30_000 },
} as const;

/**
 * Runs one model call under a deadline and records what it cost, even when it fails after
 * spending tokens (a rejected structured answer still used them).
 */
export async function metered<T>(
  run: Run,
  step: AnalysisStepId,
  model: string,
  timeoutMs: number,
  call: (signal: AbortSignal) => Promise<{ value: T; usage: Usage | null }>,
): Promise<T> {
  const started = Date.now();
  try {
    const { value, usage } = await call(deadline(timeoutMs, run.deps.signal));
    run.meter.record(step, model, usage, Date.now() - started);
    return value;
  } catch (error) {
    if (error instanceof JsonAnswerError)
      run.meter.record(step, model, error.usage, Date.now() - started);
    throw error;
  }
}

/** Why a model call failed, in words the seller can read. */
export function failureReason(error: unknown): string {
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" ||
      error.name === "AbortError" ||
      /timed? ?out|abort/i.test(error.message))
  ) {
    return "didn't answer in time";
  }
  if (error instanceof JsonAnswerError) return "didn't return a usable answer";
  const status = (error as { status?: number } | null)?.status;
  if (status === 429) return "was busy";
  if (typeof status === "number" && status >= 500) return "had a server error";
  return "failed";
}

/**
 * A step that couldn't use its model: say so plainly in an error event, note it so the run isn't
 * recorded for replay, and carry on with what plain code can do instead.
 */
export function stepFailed<T>(
  run: Run,
  step: AnalysisStepId,
  model: string | undefined,
  error: unknown,
  label: string,
  fallback: T,
): T {
  console.error(`[analysis] ${step} fell back`, error);
  run.problems.push(step);
  run.emit({ type: "step", step, state: "error", label, ...(model ? { model } : {}) });
  return fallback;
}
