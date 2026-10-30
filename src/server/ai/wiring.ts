import "server-only";

import type { Shop } from "@/lib/domain";
import { seedCaseId } from "@/server/demo/seed";
import { addSpend, dailySpendCap, rateLimit, spendToday } from "@/server/limits";
import { syncShopNow } from "@/server/paypal/shop-sync";
import type { SyncResult } from "@/server/paypal/sync";
import { getStore } from "@/server/store";
import type { Budget } from "./budget";
import { tokenFactory } from "./client";
import { modelsFromEnv } from "./models";
import { analyzeCase, type AnalyzeDeps } from "./pipeline";
import { publicPhotoReader } from "./photos";
import type { SweepDeps } from "./sweep";
import { webReader } from "./web";

export { webReader } from "./web";

/**
 * The real services behind the agent, for route handlers: the store, Token Factory, Tavily, the
 * limits, the shop's own PayPal connection and the photos on disk. Everything under src/server/ai
 * takes these as arguments, so its tests run on fakes.
 */

export function liveBudget(): Budget {
  return {
    rateLimit: (key, limit, windowSeconds) => rateLimit(key, limit, windowSeconds),
    addSpend: (dollars) => addSpend(dollars),
    spendToday: () => spendToday(),
  };
}

/** What an analysis of `caseId` needs in this shop. Only a sample shop's seeded cases replay. */
export function analysisDeps(shop: Shop, caseId: string, live: boolean): AnalyzeDeps {
  return {
    store: getStore(),
    client: tokenFactory(),
    shop,
    caseId,
    budget: liveBudget(),
    live,
    web: webReader(),
    siteUrl: process.env.SITE_URL ?? null,
    readPhoto: publicPhotoReader(),
    seedCaseId: shop.kind === "sample" ? seedCaseId(caseId) : null,
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

export const SAMPLE_SYNC_LABEL =
  "This sample shop simulates PayPal, so there are no new disputes to fetch";
export const UNCONNECTED_SYNC_LABEL =
  "This shop isn't connected to PayPal, so there are no new disputes to fetch";

/**
 * The overnight check in this shop; `full` also prepares each new case's analysis. A real shop
 * syncs through its own PayPal connection first; a sample shop says it simulates PayPal.
 */
export function sweepDeps(shop: Shop, full: boolean): SweepDeps {
  const store = getStore();
  const sync: SweepDeps["sync"] =
    shop.kind === "sample"
      ? async () => ({ label: SAMPLE_SYNC_LABEL })
      : async () => {
          const result = await syncShopNow(store, shop);
          return { label: result ? syncLabel(result) : UNCONNECTED_SYNC_LABEL };
        };
  return {
    store,
    client: tokenFactory(),
    shop,
    budget: liveBudget(),
    models: modelsFromEnv(),
    spendCap: dailySpendCap(),
    sync,
    analyze: full ? (caseId) => analyzeCase(analysisDeps(shop, caseId, false)) : null,
  };
}
