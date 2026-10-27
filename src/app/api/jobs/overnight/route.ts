import { errorResponse, respond } from "@/server/actions/errors";
import { runSweep } from "@/server/ai/sweep";
import { sweepDeps } from "@/server/ai/wiring";
import { deleteExpiredDemoCopies } from "@/server/demo/cleanup";
import { LIVE_WORKSPACE_ID, safeEqual } from "@/server/session";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * For Cloud Scheduler: the overnight check on the live sandbox workspace, with a full analysis
 * prepared for each new case. Needs the header x-truce-job-key to match TRUCE_JOB_KEY. Answers
 * with a short JSON summary once it's done.
 */
export async function POST(request: Request) {
  const expected = process.env.TRUCE_JOB_KEY?.trim();
  const given = request.headers.get("x-truce-job-key")?.trim() ?? "";
  if (!expected || !safeEqual(given, expected))
    return errorResponse(401, "This job needs its key.");

  return respond(async () => {
    // Demo copies last a week; clear out the expired ones before the check.
    const { deleted } = await deleteExpiredDemoCopies();
    const workspace = await getStore().getWorkspace(LIVE_WORKSPACE_ID);
    if (!workspace)
      return Response.json({
        ok: true,
        deletedDemoCopies: deleted,
        skipped: "The live workspace hasn't been opened yet.",
      });
    const summary = { analyzed: 0, flagged: 0, cost: 0, notes: [] as string[] };
    for await (const event of runSweep(sweepDeps(workspace, true))) {
      if (event.type === "done") {
        summary.analyzed = event.analyzed;
        summary.flagged = event.flagged;
      }
      if (event.type === "usage") summary.cost += event.cost ?? 0;
      if (event.type === "error") summary.notes.push(event.message);
    }
    return Response.json({
      ok: true,
      deletedDemoCopies: deleted,
      ...summary,
      cost: Math.round(summary.cost * 1e6) / 1e6,
    });
  });
}
