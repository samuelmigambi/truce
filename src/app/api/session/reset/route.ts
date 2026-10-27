import type { SessionResponse } from "@/lib/api-types";
import { ActionError, respond } from "@/server/actions/errors";
import { rateLimit } from "@/server/limits";
import { currentWorkspace, resetWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";

/** Starts the visitor's demo copy over from the seed. */
export async function POST() {
  return respond(async () => {
    const workspace = await currentWorkspace();
    if (!(await rateLimit(`reset:${workspace.id}`, 12, 60 * 60))) {
      throw new ActionError(429, "That's a lot of resets. Try again in a little while.");
    }
    const body: SessionResponse = { workspace: await resetWorkspace(workspace) };
    return Response.json(body);
  });
}
