import type { Metrics } from "@/lib/api-types";
import { metricsFor } from "@/server/actions/views";
import { json, shopRoute } from "@/server/http";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/** The dashboard's numbers, computed from the shop's records as they stand. */
export const GET = shopRoute("read", async ({ shop }) => {
  const body: Metrics = await metricsFor(getStore(), shop);
  return json(body);
});
