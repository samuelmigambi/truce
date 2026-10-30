import { z } from "zod";
import type { ChatRequest } from "@/lib/api-types";
import { eventStream } from "@/lib/sse";
import { ActionError, readBody } from "@/server/actions/errors";
import { currentCases } from "@/server/actions/views";
import { chatTurn } from "@/server/ai/chat";
import { tokenFactory } from "@/server/ai/client";
import { modelsFromEnv } from "@/server/ai/models";
import { liveBudget } from "@/server/ai/wiring";
import { startTurn, recordTurn } from "@/server/chats";
import { recordId, shopRoute } from "@/server/http";
import { dailySpendCap, enforceLimit } from "@/server/limits";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

const chatSchema: z.ZodType<ChatRequest> = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .min(1)
    .max(40),
  caseId: z.string().max(120).nullable().optional(),
  chatId: recordId.nullable().optional(),
});

/**
 * Ask Truce: streams one answer as ChatEvents, with tool chips and cards. It never sends anything.
 * The question and the answer are saved to the person's chat, a new one unless `chatId` names one.
 */
export const POST = shopRoute("read", async ({ request, user, shop }) => {
  const body = await readBody(request, chatSchema);
  await enforceLimit(
    `chat-user:${user.uid}`,
    120,
    60 * 60,
    "That's a lot of questions in an hour. Try again in a little while.",
  );
  const store = getStore();
  const question = body.messages.at(-1);
  if (question?.role !== "user" || !question.content.trim()) {
    throw new ActionError(400, "Ask a question to start.");
  }
  const chat = await startTurn(store, shop.id, user.uid, body.chatId, question.content.trim());
  // Replies that are due play out first, so answers match the inbox.
  await currentCases(store, shop);
  const answer = chatTurn({
    store,
    client: tokenFactory(),
    shop,
    budget: liveBudget(),
    models: modelsFromEnv(),
    request: body,
    spendCap: dailySpendCap(),
    signal: request.signal,
  });
  return eventStream(recordTurn(store, shop.id, chat, answer), request.signal);
});
