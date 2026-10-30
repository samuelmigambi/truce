import { z } from "zod";
import type { ChatResponse, RenameChatRequest } from "@/lib/api-types";
import { ActionError, readBody } from "@/server/actions/errors";
import { json, noContent, param, shopRoute } from "@/server/http";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/** One of this person's chats, with its messages; someone else's is simply not found. */
export const GET = shopRoute("read", async ({ user, shop, params }) => {
  const chat = await getStore().getChat(shop.id, user.uid, param(params, "chatId"));
  if (!chat)
    throw new ActionError(404, "That chat isn't there any more.", { code: "chat_missing" });
  const body: ChatResponse = { chat };
  return json(body);
});

const renameSchema: z.ZodType<RenameChatRequest> = z.object({
  title: z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "Give the chat a name.").max(80, "Keep the name under 80 characters.")),
});

/** Renames one of this person's chats. Its place in the list stays where it was. */
export const PATCH = shopRoute("read", async ({ request, user, shop, params }) => {
  const { title } = await readBody(request, renameSchema);
  const store = getStore();
  const chat = await store.getChat(shop.id, user.uid, param(params, "chatId"));
  if (!chat)
    throw new ActionError(404, "That chat isn't there any more.", { code: "chat_missing" });
  await store.saveChat(shop.id, { ...chat, title });
  return noContent();
});

/** Deletes one of this person's chats. Deleting one that's already gone is fine. */
export const DELETE = shopRoute("read", async ({ user, shop, params }) => {
  await getStore().deleteChat(shop.id, user.uid, param(params, "chatId"));
  return noContent();
});
