import type { OrdersResponse } from "@/lib/api-types";
import { ordersWithChecks } from "@/server/actions/views";
import { json, shopRoute } from "@/server/http";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/** Every order with its before-shipping checks, those waiting to ship first. */
export const GET = shopRoute("read", async ({ shop }) => {
  const body: OrdersResponse = {
    orders: await ordersWithChecks(getStore(), shop),
    history: shop.orderHistory,
  };
  return json(body);
});
