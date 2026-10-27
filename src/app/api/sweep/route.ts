import { eventStream } from "@/lib/sse";
import { respond } from "@/server/actions/errors";
import { runSweep } from "@/server/ai/sweep";
import { sweepDeps } from "@/server/ai/wiring";
import { currentWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";

/**
 * The overnight check, run now: new disputes from PayPal (live workspace), every unread case sorted
 * by Lightning, and the orders waiting to ship checked against Seller Protection. Streams
 * SweepEvents.
 */
export async function POST(request: Request) {
  return respond(async () => {
    const workspace = await currentWorkspace();
    return eventStream(runSweep(sweepDeps(workspace, false)), request.signal);
  });
}
