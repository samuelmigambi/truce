import type { CaseResponse } from "@/lib/api-types";
import { respond } from "@/server/actions/errors";
import { caseFile } from "@/server/actions/views";
import { currentWorkspace } from "@/server/session";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/** One case file: the case, its order, its events and the agent's analysis. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await params;
    const workspace = await currentWorkspace();
    const body: CaseResponse = await caseFile(getStore(), workspace, id);
    return Response.json(body);
  });
}
