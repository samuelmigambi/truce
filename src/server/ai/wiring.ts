import "server-only";

import type { Workspace } from "@/lib/domain";
import { seedCaseId } from "@/server/demo/seed";
import { addSpend, dailySpendCap, rateLimit, spendToday } from "@/server/limits";
import { paypal } from "@/server/paypal";
import { syncDisputes, type SyncResult } from "@/server/paypal/sync";
import { getStore } from "@/server/store";
import { Tavily } from "@/server/tavily";
import type { Budget } from "./budget";
import { tokenFactory } from "./client";
import { modelsFromEnv } from "./models";
import { analyzeCase, type AnalyzeDeps, type WebReader } from "./pipeline";
import { PAGE_MS } from "./pipeline/gather";
import { publicPhotoReader } from "./photos";
import type { SweepDeps } from "./sweep";

/**
 * The real services behind the agent, for route handlers: the store, Token Factory, Tavily, the
 * limits and the photos on disk. Everything under src/server/ai takes these as arguments, so its
 * tests run on fakes.
 */

/**
 * Tavily, for reading the listing and policies as the buyer saw them, with every request cut off
 * at PAGE_MS, so a slow page falls back to the catalog instead of holding up the analysis.
 */
export function webReader(): WebReader | null {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) return null;
  const timed: typeof fetch = (input, init) =>
    fetch(input, {
      ...init,
      signal: AbortSignal.any([
        AbortSignal.timeout(PAGE_MS),
        ...(init?.signal ? [init.signal] : []),
      ]),
    });
  const tavily = new Tavily(key, timed);
  return { extract: (urls) => tavily.extract(urls) };
}

export function liveBudget(): Budget {
  return {
    rateLimit: (key, limit, windowSeconds) => rateLimit(key, limit, windowSeconds),
    addSpend: (dollars) => addSpend(dollars),
    spendToday: () => spendToday(),
  };
}

/** What an analysis of `caseId` needs in this workspace. */
export function analysisDeps(workspace: Workspace, caseId: string, live: boolean): AnalyzeDeps {
  return {
    store: getStore(),
    client: tokenFactory(),
    workspace,
    caseId,
    budget: liveBudget(),
    live,
    web: webReader(),
    siteUrl: process.env.SITE_URL ?? null,
    readPhoto: publicPhotoReader(),
    seedCaseId: workspace.kind === "demo" ? seedCaseId(caseId) : null,
    models: modelsFromEnv(),
    spendCap: dailySpendCap(),
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function syncLabel(result: SyncResult): string {
  if (result.created === 0 && result.updated === 0) {
    return result.checked
      ? `PayPal has nothing new (${plural(result.checked, "dispute", "disputes")} checked)`
      : "PayPal has no disputes yet";
  }
  const parts = [
    result.created ? `${plural(result.created, "new dispute", "new disputes")}` : "",
    result.updated ? `${plural(result.updated, "update", "updates")}` : "",
  ].filter(Boolean);
  return `From PayPal: ${parts.join(" and ")}`;
}

/** The overnight check in this workspace; `full` also prepares each new case's analysis. */
export function sweepDeps(workspace: Workspace, full: boolean): SweepDeps {
  const store = getStore();
  const client = paypal();
  const sync: SweepDeps["sync"] =
    workspace.kind === "live"
      ? client
        ? async () => ({ label: syncLabel(await syncDisputes(store, workspace, client)) })
        : null
      : async () => ({
          label: "This demo copy simulates PayPal, so there are no new disputes to fetch",
        });
  return {
    store,
    client: tokenFactory(),
    workspace,
    budget: liveBudget(),
    models: modelsFromEnv(),
    spendCap: dailySpendCap(),
    sync,
    analyze: full ? (caseId) => analyzeCase(analysisDeps(workspace, caseId, false)) : null,
  };
}
