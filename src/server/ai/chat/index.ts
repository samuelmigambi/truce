import "server-only";

import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ChatCard, ChatEvent, ChatRequest } from "@/lib/api-types";
import type { Workspace } from "@/lib/domain";
import { formatUsd } from "@/lib/money";
import type { Store } from "@/server/store/types";
import { dailySpendCap, gate, spend, type Budget } from "../budget";
import type { AiClient } from "../client";
import { runAgent, type AgentEvent } from "../loop";
import { cachedTokensOf, costOf, type Job } from "../models";
import { chatSystem, REASON_LABEL } from "../prompts";
import { clean } from "../safety";
import { CHAT_TOOLS, prepareAction, type ChatContext } from "./tools";

export { CHAT_TOOLS, addressNote, matchCases } from "./tools";

/**
 * Ask Truce: one turn of the chat on Super VL, with the shop's tools. Text streams as it's written;
 * tool chips, cards and the cost of each model call stream alongside. The chat never acts: an
 * action comes back as a card for the seller to approve.
 */

export interface ChatDeps {
  store: Store;
  client: AiClient | null;
  workspace: Workspace;
  budget: Budget;
  models: Record<Job, string>;
  request: ChatRequest;
  spendCap?: number;
  now?: () => Date;
  signal?: AbortSignal;
}

/** The conversation as the model gets it: the last few turns, each cut to a sane length. */
export function conversation(messages: ChatRequest["messages"]): ChatCompletionMessageParam[] {
  return messages
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim(),
    )
    .slice(-16)
    .map((m) => ({ role: m.role, content: clean(m.content, 4000) }));
}

/** "Refund Sam and say sorry", "Please offer Priya $10", "Can you reply to Jordan?" — not "Should I refund?". */
export function asksForAction(text: string): boolean {
  return /^\s*(?:please\s+|can you\s+|could you\s+|would you\s+)*(?:go ahead and\s+)?(?:refund|settle|offer|fight|contest|reply|respond|send|accept|make an offer|prepare|draft)\b/i.test(
    text,
  );
}

const CARD_NUDGE =
  "No action card was made yet. Call prepare_action now for what I asked, then say in one short sentence that it's ready for my approval.";

function cardKey(card: ChatCard): string {
  switch (card.kind) {
    case "case":
      return `case:${card.caseId}`;
    case "order":
      return `order:${card.orderId}`;
    case "action":
      return `action:${card.caseId}:${card.move}`;
    case "metric":
      return `metric:${card.label}`;
  }
}

async function caseLine(
  store: Store,
  workspaceId: string,
  caseId: string | null | undefined,
): Promise<string | null> {
  if (!caseId) return null;
  const kase = await store.getCase(workspaceId, caseId).catch(() => null);
  if (!kase) return null;
  return `${kase.id}: ${kase.buyer.name}, ${kase.itemSummary}, ${formatUsd(kase.amount)}, ${REASON_LABEL[kase.reason]}, ${kase.stage}.`;
}

export async function* chatTurn(deps: ChatDeps): AsyncGenerator<ChatEvent> {
  const messages = conversation(deps.request.messages);
  if (messages.at(-1)?.role !== "user") {
    yield { type: "error", message: "Ask a question to start." };
    return;
  }
  const allowed = await gate(deps.budget, "chat", deps.workspace, deps.spendCap ?? dailySpendCap());
  if (!allowed.ok) {
    yield { type: "error", message: allowed.message };
    return;
  }
  if (!deps.client) {
    yield { type: "error", message: "Ask Truce needs Token Factory, which isn't connected here." };
    return;
  }

  const now = deps.now?.() ?? new Date();
  const context: ChatContext = {
    store: deps.store,
    workspace: deps.workspace,
    client: deps.client,
    models: deps.models,
    now,
    budget: deps.budget,
    usage: [],
    signal: deps.signal,
  };
  const system = chatSystem({
    shopName: deps.workspace.shopName,
    now,
    live: deps.workspace.kind === "live",
    caseLine: await caseLine(deps.store, deps.workspace.id, deps.request.caseId),
  });
  const shown = new Set<string>();
  const pending: Promise<void>[] = [];
  let answer = "";

  /** Streams one run of the agent, keeping cards unique and every call costed. */
  async function* follow(run: AsyncGenerator<AgentEvent, unknown>): AsyncGenerator<ChatEvent> {
    for await (const event of run) {
      if (event.type === "card") {
        const card = event.card as ChatCard;
        const key = cardKey(card);
        if (shown.has(key)) continue;
        shown.add(key);
        yield { type: "card", card };
        continue;
      }
      if (event.type === "text") answer += event.delta;
      if (event.type === "usage") pending.push(spend(deps.budget, event.cost));
      yield event;
      // Calls made inside tools (embeddings) are reported once the tool is done.
      for (const extra of context.usage.splice(0)) {
        const cost = costOf(extra.model, extra.usage);
        pending.push(spend(deps.budget, cost));
        yield {
          type: "usage",
          model: extra.model,
          input: extra.usage.prompt_tokens,
          output: extra.usage.completion_tokens ?? 0,
          cached: cachedTokensOf(extra.usage),
          cost,
        };
      }
    }
  }

  const agent = {
    client: deps.client,
    model: deps.models.draft,
    system,
    context,
    maxTokens: 1200,
    thinking: false,
    signal: deps.signal,
    // A hung call is retried after 30 s instead of holding the answer for the SDK's full minute.
    attemptTimeoutMs: 30_000,
  };
  try {
    yield* follow(
      runAgent({ ...agent, messages, tools: CHAT_TOOLS, maxRounds: 5, maxToolCalls: 8 }),
    );
    // Asked to act, but no card came back: the model may even say it's done. One more round,
    // with only prepare_action, makes the card the seller was promised (seen live on 27 Oct).
    const asked = String(messages.at(-1)?.content ?? "");
    if (asksForAction(asked) && ![...shown].some((key) => key.startsWith("action:"))) {
      yield* follow(
        runAgent({
          ...agent,
          messages: [
            ...messages,
            { role: "assistant", content: answer || "Looking into it." },
            { role: "user", content: CARD_NUDGE },
          ],
          tools: [prepareAction],
          maxRounds: 2,
          maxToolCalls: 1,
        }),
      );
    }
  } catch (error) {
    if (deps.signal?.aborted) return;
    console.error("[chat] turn failed", error);
    yield {
      type: "error",
      message: "Truce couldn't finish that answer. Try asking again in a moment.",
    };
  } finally {
    await Promise.allSettled(pending);
  }
}
