import type { CasesResponse } from "@/lib/api-types";
import { caseSummaries } from "@/server/actions/views";
import { json, shopRoute } from "@/server/http";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/** The inbox: open cases by deadline, then closed ones, each with Truce's move when it has one. */
export const GET = shopRoute("read", async ({ shop }) => {
  const body: CasesResponse = { cases: await caseSummaries(getStore(), shop) };
  return json(body);
});
