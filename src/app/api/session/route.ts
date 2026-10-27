import type { SessionResponse } from "@/lib/api-types";
import { respond } from "@/server/actions/errors";
import { currentWorkspace } from "@/server/session";

export const dynamic = "force-dynamic";

/** The visitor's workspace; the first visit makes and seeds their demo copy and sets the cookie. */
export async function GET() {
  return respond(async () => {
    const body: SessionResponse = { workspace: await currentWorkspace() };
    return Response.json(body);
  });
}
