import type { NotificationsResponse } from "@/lib/api-types";
import { json, shopRoute } from "@/server/http";
import { notificationsFor } from "@/server/notifications";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/** The shop's notifications as this member sees them, newest first. */
export const GET = shopRoute("read", async ({ user, shop }) => {
  const store = getStore();
  const cases = await store.listCases(shop.id);
  const body: NotificationsResponse = await notificationsFor(store, shop, user.uid, cases);
  return json(body);
});
