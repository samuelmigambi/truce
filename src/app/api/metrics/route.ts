import type { Metrics } from "@/lib/api-types";
import { respond } from "@/server/actions/errors";
import { metricsFor } from "@/server/actions/views";
import { currentWorkspace } from "@/server/session";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/** The dashboard's numbers, computed from the records as they stand. */
export async function GET() {
  return respond(async () => {
    const workspace = await currentWorkspace();
    const body: Metrics = await metricsFor(getStore(), workspace);
    return Response.json(body);
  });
}
