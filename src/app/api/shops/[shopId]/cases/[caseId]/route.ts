import type { CaseResponse } from "@/lib/api-types";
import { caseFile } from "@/server/actions/views";
import { json, param, shopRoute } from "@/server/http";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/** One case file: the case, its order, its events and the agent's analysis. */
export const GET = shopRoute("read", async ({ shop, params }) => {
  const body: CaseResponse = await caseFile(getStore(), shop, param(params, "caseId"));
  return json(body);
});
