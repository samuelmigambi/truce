import type { ChatsResponse } from "@/lib/api-types";
import { json, shopRoute } from "@/server/http";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/** How many of a person's chats the list holds, the most recent first. */
const LIST_LIMIT = 100;

/** This person's saved Ask Truce chats in the shop. Nobody else's are ever listed. */
export const GET = shopRoute("read", async ({ user, shop }) => {
  const body: ChatsResponse = { chats: await getStore().listChats(shop.id, user.uid, LIST_LIMIT) };
  return json(body);
});
