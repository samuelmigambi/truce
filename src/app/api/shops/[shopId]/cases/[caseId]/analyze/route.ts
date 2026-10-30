import { eventStream } from "@/lib/sse";
import { caseFile } from "@/server/actions/views";
import { analyzeCase } from "@/server/ai/pipeline";
import { analysisDeps } from "@/server/ai/wiring";
import { param, shopRoute } from "@/server/http";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * Streams the case analysis as AnalysisEvents. A sample shop's case analyzed before replays its
 * recorded run; `?live=1` runs it again live, within the day's limits. A real shop always runs
 * live. The run carries on and saves its result if the browser goes away.
 */
export const POST = shopRoute("act", async ({ request, shop, params }) => {
  const caseId = param(params, "caseId");
  // Brings the case up to date first (replies, scans), and 404s an unknown one.
  await caseFile(getStore(), shop, caseId);
  const live = new URL(request.url).searchParams.get("live") === "1";
  return eventStream(analyzeCase(analysisDeps(shop, caseId, live)), request.signal);
});
