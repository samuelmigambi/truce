import type { OrdersResponse } from "@/lib/api-types";
import { respond } from "@/server/actions/errors";
import { ordersWithChecks } from "@/server/actions/views";
import { currentWorkspace } from "@/server/session";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/** Every order with its before-shipping checks, those waiting to ship first. */
export async function GET() {
  return respond(async () => {
    const workspace = await currentWorkspace();
    const body: OrdersResponse = { orders: await ordersWithChecks(getStore(), workspace) };
    return Response.json(body);
  });
}
