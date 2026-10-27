import { z } from "zod";
import type { ChatRequest } from "@/lib/api-types";
import { eventStream } from "@/lib/sse";
import { readBody, respond } from "@/server/actions/errors";
import { currentCases } from "@/server/actions/views";
import { chatTurn } from "@/server/ai/chat";
import { tokenFactory } from "@/server/ai/client";
import { modelsFromEnv } from "@/server/ai/models";
import { liveBudget } from "@/server/ai/wiring";
import { dailySpendCap } from "@/server/limits";
import { currentWorkspace } from "@/server/session";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

const Body: z.ZodType<ChatRequest> = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .min(1)
    .max(40),
  caseId: z.string().max(80).nullable().optional(),
});

/** Ask Truce: streams one answer as ChatEvents, with tool chips and cards. It never sends anything. */
export async function POST(request: Request) {
  return respond(async () => {
    const body = await readBody(request, Body);
    const workspace = await currentWorkspace();
    const store = getStore();
    // Scripted buyer replies that are due play out first, so answers match the inbox.
    await currentCases(store, workspace);
    return eventStream(
      chatTurn({
        store,
        client: tokenFactory(),
        workspace,
        budget: liveBudget(),
        models: modelsFromEnv(),
        request: body,
        spendCap: dailySpendCap(),
        signal: request.signal,
      }),
      request.signal,
    );
  });
}
