import "server-only";

import type { AnalysisEvent } from "@/lib/api-types";
import type { AnalysisStepId, Case, ModelStep, Order, Workspace } from "@/lib/domain";
import type { RatioState } from "@/lib/rules/ratio";
import type { Store } from "@/server/store/types";
import { spend, type Budget } from "../budget";
import type { AiClient } from "../client";
import { cachedTokensOf, costOf, type Job, type Usage } from "../models";

/** Reads web pages for evidence (Tavily's extract in production). */
export interface WebReader {
  extract(urls: string[]): Promise<{ url: string; content: string }[]>;
}

/** Turns a case photo's URL into a data URL the vision model can read, or null. */
export type PhotoReader = (url: string) => Promise<string | null>;

/** Everything an analysis needs, passed in so tests can use fakes. */
export interface AnalyzeDeps {
  store: Store;
  /** Token Factory; null when NEBIUS_API_KEY isn't set (replays still work). */
  client: AiClient | null;
  workspace: Workspace;
  caseId: string;
  budget: Budget;
  /** "Run again live": skip the recorded run. */
  live?: boolean;
  web?: WebReader | null;
  /** The public address of the shop's pages, for reading the listing as the buyer saw it. */
  siteUrl?: string | null;
  readPhoto?: PhotoReader;
  /** The seed's stable ID for this case, when it's one of the demo cases; replays are keyed by it. */
  seedCaseId?: string | null;
  models: Record<Job, string>;
  spendCap?: number;
  now?: () => Date;
  /** Waits between replayed events; tests pass one that doesn't wait. */
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

/** One live run's shared state: what the steps read, and where they report. */
export interface Run {
  deps: AnalyzeDeps;
  client: AiClient;
  kase: Case;
  order: Order | null;
  closed: Case[];
  ratio: RatioState;
  now: Date;
  emit(event: AnalysisEvent): void;
  meter: Meter;
  /** Steps that fell back to plain code; a run with any isn't recorded for replay. */
  problems: string[];
}

/**
 * Keeps the cost of every model call: one ModelStep per step and model, a usage event for the
 * app, and the dollars counted against the daily cap.
 */
export class Meter {
  readonly steps: ModelStep[] = [];
  private readonly pending: Promise<void>[] = [];

  constructor(
    private readonly emit: (event: AnalysisEvent) => void,
    private readonly budget: Budget,
  ) {}

  record(step: AnalysisStepId, model: string, usage: Usage | null, ms: number): void {
    const input = usage?.prompt_tokens ?? 0;
    const output = usage?.completion_tokens ?? 0;
    const cached = usage ? cachedTokensOf(usage) : 0;
    const cost = usage ? costOf(model, usage) : null;
    const existing = this.steps.find((s) => s.step === step && s.model === model);
    if (existing) {
      existing.inputTokens += input;
      existing.outputTokens += output;
      existing.cachedTokens += cached;
      existing.cost =
        existing.cost === null || cost === null ? (existing.cost ?? cost) : existing.cost + cost;
      existing.ms += ms;
    } else {
      this.steps.push({
        step,
        model,
        inputTokens: input,
        outputTokens: output,
        cachedTokens: cached,
        cost,
        ms,
      });
    }
    this.emit({ type: "usage", step, model, input, output, cached, cost });
    this.pending.push(spend(this.budget, cost));
  }

  total(): number {
    return this.steps.reduce((sum, s) => sum + (s.cost ?? 0), 0);
  }

  /** Waits for the spend counters to catch up. */
  settle(): Promise<unknown> {
    return Promise.allSettled(this.pending);
  }
}
