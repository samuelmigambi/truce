import "server-only";

import { randomBytes } from "node:crypto";
import type { ChatEvent } from "@/lib/api-types";
import {
  applyChatEvent,
  finishMessage,
  titleFrom,
  type ChatMessage,
  type ChatThread,
} from "@/lib/chat-thread";
import { ActionError } from "@/server/actions/errors";
import { log } from "@/server/log";
import type { Store } from "@/server/store";

/**
 * Saved Ask Truce chats. Each turn saves twice: the question as soon as it's asked, so the chat
 * is in the list at once, and the answer when it finishes or the person stops it, exactly as far
 * as it got. Chats belong to one person in one shop.
 */

/** Long enough that a chat's ID can't be guessed; chats are also checked against their owner. */
export function newChatId(): string {
  return `ch_${randomBytes(12).toString("base64url")}`;
}

function newMessageId(): string {
  return `m_${randomBytes(8).toString("base64url")}`;
}

/** The chat a question belongs to, with the question added and saved. */
export async function startTurn(
  store: Store,
  shopId: string,
  uid: string,
  chatId: string | null | undefined,
  question: string,
  now = new Date(),
): Promise<ChatThread> {
  const at = now.toISOString();
  let chat: ChatThread;
  if (chatId) {
    const found = await store.getChat(shopId, uid, chatId);
    if (!found) {
      throw new ActionError(404, "That chat isn't there any more. Start a new one.", {
        code: "chat_missing",
      });
    }
    chat = found;
  } else {
    chat = {
      id: newChatId(),
      uid,
      title: titleFrom(question),
      createdAt: at,
      updatedAt: at,
      messages: [],
    };
  }
  const asked: ChatMessage = {
    id: newMessageId(),
    role: "user",
    parts: [{ type: "text", text: question }],
    streaming: false,
    model: null,
    cost: 0,
  };
  const saved: ChatThread = { ...chat, updatedAt: at, messages: [...chat.messages, asked] };
  await store.saveChat(shopId, saved);
  return saved;
}

/**
 * Passes the answer's events through, first telling the browser which chat they belong to,
 * and saves the answer once the stream ends for any reason.
 */
export async function* recordTurn(
  store: Store,
  shopId: string,
  chat: ChatThread,
  events: AsyncIterable<ChatEvent>,
  now: () => Date = () => new Date(),
): AsyncGenerator<ChatEvent> {
  yield { type: "chat", id: chat.id, title: chat.title };
  let reply: ChatMessage = {
    id: newMessageId(),
    role: "assistant",
    parts: [],
    streaming: false,
    model: null,
    cost: 0,
  };
  try {
    for await (const event of events) {
      reply = applyChatEvent(reply, event);
      yield event;
    }
  } catch (error) {
    reply = applyChatEvent(reply, {
      type: "error",
      message: "Something went wrong on our side. Try again in a moment.",
    });
    throw error;
  } finally {
    const saved: ChatThread = {
      ...chat,
      updatedAt: now().toISOString(),
      messages: [...chat.messages, finishMessage(reply)],
    };
    try {
      await store.saveChat(shopId, saved);
    } catch (error) {
      log.error("chat.save_failed", { shopId, chatId: chat.id, error: String(error) });
    }
  }
}
