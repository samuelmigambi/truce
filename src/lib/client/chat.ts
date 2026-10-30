"use client";

import type { MouseEvent } from "react";
import { mutate } from "swr";
import type { ChatEvent, ChatRequest, ChatResponse, ChatsResponse } from "@/lib/api-types";
import {
  applyChatEvent,
  finishMessage,
  textOf,
  type ChatMessage,
  type ChatPart,
} from "@/lib/chat-thread";
import { readEvents } from "@/lib/sse";
import {
  deleteJson,
  errorMessage,
  getJson,
  HttpError,
  openStream,
  patchJson,
  shopApi,
  shopHref,
} from "./api";
import { createStore, useStore } from "./store";

export { textOf, type ChatMessage, type ChatPart };

/**
 * Ask Truce in the browser. Each shop holds its chats by ID, plus one not saved yet ("new"):
 * it gets its ID from the first answer and moves under it. The home page shows the chat named
 * in its address; the slide-over shows whichever chat was open last. An answer keeps streaming
 * while the person looks elsewhere, and switching shops switches everything.
 */

export const NEW_CHAT = "new";

export interface ChatState {
  /** The saved chat's ID; null until the first answer starts. */
  chatId: string | null;
  messages: ChatMessage[];
  busy: boolean;
  /** "loading" while a saved chat comes from the server; "missing" when it isn't there. */
  status: "ready" | "loading" | "missing" | "error";
}

interface ShopChats {
  threads: Record<string, ChatState>;
  /** The chat the slide-over shows. */
  active: string;
  /**
   * The saved chat the new one became, until another new chat starts. The page names a chat by
   * its address, which takes a moment to catch up; meanwhile "new" still finds the conversation.
   */
  adopted: string | null;
}

const EMPTY: ChatState = { chatId: null, messages: [], busy: false, status: "ready" };
const NO_CHATS: ShopChats = { threads: {}, active: NEW_CHAT, adopted: null };
const chats = createStore<Record<string, ShopChats>>({});
const controllers = new Map<string, AbortController>();
let counter = 0;

const newId = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`;
const controllerKey = (shopId: string, key: string) => `${shopId}/${key}`;

export const chatsKey = (shopId: string) => shopApi(shopId, "chats");
const chatUrl = (shopId: string, chatId: string) =>
  shopApi(shopId, `chats/${encodeURIComponent(chatId)}`);

function setShop(shopId: string, update: (state: ShopChats) => ShopChats) {
  chats.set((all) => ({ ...all, [shopId]: update(all[shopId] ?? NO_CHATS) }));
}

function setThread(shopId: string, key: string, update: (state: ChatState) => ChatState) {
  setShop(shopId, (s) => ({
    ...s,
    threads: { ...s.threads, [key]: update(s.threads[key] ?? EMPTY) },
  }));
}

/** The chat a key means: "new", once it has an ID, means the chat it became. */
function resolve(shop: ShopChats | undefined, key: string): string {
  return key === NEW_CHAT && shop?.adopted && !shop.threads[NEW_CHAT] ? shop.adopted : key;
}

function readThread(shopId: string, key: string): ChatState {
  const shop = chats.get()[shopId];
  return shop?.threads[resolve(shop, key)] ?? EMPTY;
}

/** The new chat becomes a saved one: everything under "new" moves under its ID. */
function adoptId(shopId: string, chatId: string) {
  setShop(shopId, (s) => {
    const { [NEW_CHAT]: fresh, ...rest } = s.threads;
    return {
      threads: { ...rest, [chatId]: { ...(fresh ?? EMPTY), chatId } },
      active: s.active === NEW_CHAT ? chatId : s.active,
      adopted: chatId,
    };
  });
  const controller = controllers.get(controllerKey(shopId, NEW_CHAT));
  if (controller) {
    controllers.delete(controllerKey(shopId, NEW_CHAT));
    controllers.set(controllerKey(shopId, chatId), controller);
  }
}

/** Lists change when a chat is asked in, so the list is read again. */
function refreshList(shopId: string) {
  void mutate(chatsKey(shopId));
}

/**
 * Sends a question in one of a shop's chats: `key` is the chat's ID, or NEW_CHAT to start one.
 * `onSaved` hears the new chat's ID as soon as the server has saved it. `caseId` is the case on
 * screen, if any.
 */
export function sendChat(
  shopId: string,
  asked: string,
  text: string,
  options: { caseId?: string | null; onSaved?: (chatId: string) => void } = {},
) {
  const key = resolve(chats.get()[shopId], asked);
  const question = text.trim();
  const current = readThread(shopId, key);
  if (!question || current.busy) return;
  const history: ChatRequest["messages"] = current.messages
    .map((m) => ({ role: m.role, content: textOf(m) }))
    .filter((m) => m.content.trim().length > 0);
  const user: ChatMessage = {
    id: newId(),
    role: "user",
    parts: [{ type: "text", text: question }],
    streaming: false,
    model: null,
    cost: 0,
  };
  const reply: ChatMessage = {
    id: newId(),
    role: "assistant",
    parts: [],
    streaming: true,
    model: null,
    cost: 0,
  };
  setThread(shopId, key, (state) => ({
    ...state,
    status: "ready",
    messages: [...state.messages, user, reply],
    busy: true,
  }));

  const controller = new AbortController();
  controllers.set(controllerKey(shopId, key), controller);
  // The route takes the last 40 turns; older ones drop off the front.
  const turns = [...history, { role: "user" as const, content: question }]
    .slice(-40)
    .map((m) => ({ ...m, content: m.content.slice(0, 8000) }));
  const body: ChatRequest = {
    messages: turns,
    caseId: options.caseId ?? null,
    chatId: current.chatId,
  };
  // The chat this answer belongs to; it changes once when a new chat gets its ID.
  let at = key;
  const update = (change: (m: ChatMessage) => ChatMessage) =>
    setThread(shopId, at, (state) => ({
      ...state,
      messages: state.messages.map((m) => (m.id === reply.id ? change(m) : m)),
    }));

  void (async () => {
    try {
      const response = await openStream(shopApi(shopId, "chat"), body, controller.signal);
      for await (const event of readEvents<ChatEvent>(response, controller.signal)) {
        if (event.type === "chat") {
          if (at === NEW_CHAT) {
            adoptId(shopId, event.id);
            at = event.id;
            options.onSaved?.(event.id);
          }
          refreshList(shopId);
          continue;
        }
        update((m) => applyChatEvent(m, event));
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        update((m) => applyChatEvent(m, { type: "error", message: errorMessage(error) }));
      }
    } finally {
      update(finishMessage);
      const k = controllerKey(shopId, at);
      if (controllers.get(k) === controller) controllers.delete(k);
      setThread(shopId, at, (state) => ({ ...state, busy: false }));
      refreshList(shopId);
    }
  })();
}

/** Stops the answer streaming in one chat. */
export function stopChat(shopId: string, key: string) {
  controllers.get(controllerKey(shopId, resolve(chats.get()[shopId], key)))?.abort();
}

/** Opens a saved chat: from memory when it's here, otherwise from the server. */
export function openChat(shopId: string, chatId: string) {
  setShop(shopId, (s) => ({ ...s, active: chatId }));
  const known = readThread(shopId, chatId);
  if (known.busy || (known.status === "ready" && known.messages.length > 0)) return;
  if (known.status === "loading") return;
  setThread(shopId, chatId, () => ({ ...EMPTY, chatId, status: "loading" }));
  void getJson<ChatResponse>(chatUrl(shopId, chatId))
    .then(({ chat }) => {
      setThread(shopId, chatId, (state) =>
        // An answer may have started meanwhile; it wins over the copy just read.
        state.busy
          ? state
          : { chatId, messages: chat.messages.map(finishMessage), busy: false, status: "ready" },
      );
    })
    .catch((error: unknown) => {
      const missing = error instanceof HttpError && error.status === 404;
      setThread(shopId, chatId, (state) => ({ ...state, status: missing ? "missing" : "error" }));
      // A chat that's gone isn't one for the slide-over to reopen.
      if (missing) setShop(shopId, (s) => (s.active === chatId ? { ...s, active: NEW_CHAT } : s));
    });
}

/** Starts a fresh chat: the unsaved one is emptied unless an answer is still streaming in it. */
export function startNewChat(shopId: string) {
  setShop(shopId, (s) => {
    const fresh = s.threads[NEW_CHAT];
    if (fresh?.busy) return { ...s, active: NEW_CHAT, adopted: null };
    const { [NEW_CHAT]: _dropped, ...threads } = s.threads;
    void _dropped;
    return { threads, active: NEW_CHAT, adopted: null };
  });
}

/** Renames a saved chat; the list shows the new name at once. */
export async function renameChat(shopId: string, chatId: string, title: string) {
  await patchJson(chatUrl(shopId, chatId), { title });
  await mutate(
    chatsKey(shopId),
    (data: ChatsResponse | undefined) =>
      data && { chats: data.chats.map((c) => (c.id === chatId ? { ...c, title } : c)) },
    { revalidate: true },
  );
}

/** Deletes a saved chat, here and on the server. */
export async function deleteChat(shopId: string, chatId: string) {
  stopChat(shopId, chatId);
  await deleteJson(chatUrl(shopId, chatId));
  setShop(shopId, (s) => {
    const { [chatId]: _gone, ...threads } = s.threads;
    void _gone;
    return {
      threads,
      active: s.active === chatId ? NEW_CHAT : s.active,
      adopted: s.adopted === chatId ? null : s.adopted,
    };
  });
  refreshList(shopId);
}

/** Forgets every chat the browser holds for a shop, such as when a sample shop starts over. */
export function forgetChats(shopId: string) {
  for (const [key, controller] of controllers) {
    if (key.startsWith(`${shopId}/`)) {
      controller.abort();
      controllers.delete(key);
    }
  }
  chats.set((all) => {
    if (!all[shopId]) return all;
    const rest = { ...all };
    delete rest[shopId];
    return rest;
  });
  refreshList(shopId);
}

/** A saved chat's address: the shop's home with the chat named in it. */
export function chatHref(shopId: string, chatId: string): string {
  return `${shopHref(shopId)}?chat=${encodeURIComponent(chatId)}`;
}

/**
 * Shows another chat on the home page, or a new one, without a trip to the server: the address
 * changes in place, the page reads it, and the chat opens at its start.
 */
export function showChat(href: string) {
  window.history.pushState(null, "", href);
  window.scrollTo({ top: 0, behavior: "instant" });
}

/**
 * A click on a link to a chat, opened in place. A click meant for a new tab or window is left
 * to the browser, and so is a link to another page.
 */
export function followChatLink(event: MouseEvent<HTMLAnchorElement>) {
  const { button, metaKey, ctrlKey, shiftKey, altKey, currentTarget } = event;
  if (event.defaultPrevented || button !== 0 || metaKey || ctrlKey || shiftKey || altKey) return;
  const href = new URL(currentTarget.href);
  if (href.pathname !== window.location.pathname) return;
  event.preventDefault();
  showChat(`${href.pathname}${href.search}`);
}

export function useChatThread(shopId: string, key: string): ChatState {
  return useStore(chats, (all) => {
    const shop = all[shopId];
    return shop?.threads[resolve(shop, key)] ?? EMPTY;
  });
}

/** The chat the slide-over shows: the last one opened or asked in. */
export function useActiveChat(shopId: string): string {
  return useStore(chats, (all) => all[shopId]?.active ?? NEW_CHAT);
}
