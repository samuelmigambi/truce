import type { CasesResponse } from "@/lib/api-types";
import { respond } from "@/server/actions/errors";
import { caseSummaries } from "@/server/actions/views";
import { currentWorkspace } from "@/server/session";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/** The inbox: open cases by deadline, then closed ones, each with Truce's move when it has one. */
export async function GET() {
  return respond(async () => {
    const workspace = await currentWorkspace();
    const body: CasesResponse = { cases: await caseSummaries(getStore(), workspace) };
    return Response.json(body);
  });
}
