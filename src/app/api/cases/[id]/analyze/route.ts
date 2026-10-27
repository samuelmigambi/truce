import { eventStream } from "@/lib/sse";
import { respond } from "@/server/actions/errors";
import { caseFile } from "@/server/actions/views";
import { analyzeCase } from "@/server/ai/pipeline";
import { analysisDeps } from "@/server/ai/wiring";
import { currentWorkspace } from "@/server/session";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * Streams the case analysis as AnalysisEvents. A demo case analyzed before replays its recorded
 * run; `?live=1` runs it again live, within the day's limits. The run carries on and saves its
 * result if the browser goes away, so it isn't tied to the request's signal.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await params;
    const workspace = await currentWorkspace();
    // Brings the case up to date first (scripted replies, new scans), and 404s an unknown one.
    await caseFile(getStore(), workspace, id);
    const live = new URL(request.url).searchParams.get("live") === "1";
    return eventStream(analyzeCase(analysisDeps(workspace, id, live)), request.signal);
  });
}
