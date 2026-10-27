"use client";

import type { ChatCard, ChatEvent, ChatRequest } from "@/lib/api-types";
import { readEvents } from "@/lib/sse";
import { errorMessage, openStream } from "./api";
import { createStore, useStore } from "./store";

/**
 * The Ask Truce conversation. One conversation for the whole app, so the page and the slide-over
 * show the same thread, and an answer keeps streaming while the seller looks elsewhere.
 */

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "tool"; id: string; name: string; label: string; state: "running" | "done" | "error" }
  | { type: "card"; card: ChatCard }
  | { type: "error"; message: string };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: ChatPart[];
  streaming: boolean;
  model: string | null;
  cost: number;
}

interface ChatState {
  messages: ChatMessage[];
  busy: boolean;
}

const chat = createStore<ChatState>({ messages: [], busy: false });
let controller: AbortController | null = null;
let counter = 0;

const newId = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`;

export function textOf(message: ChatMessage): string {
  return message.parts
    .filter((p): p is Extract<ChatPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function reduce(message: ChatMessage, event: ChatEvent): ChatMessage {
  const parts = message.parts;
  switch (event.type) {
    case "text": {
      const last = parts[parts.length - 1];
      if (last?.type === "text") {
        return {
          ...message,
          parts: [...parts.slice(0, -1), { type: "text", text: last.text + event.delta }],
        };
      }
      return { ...message, parts: [...parts, { type: "text", text: event.delta }] };
    }
    case "tool-start":
      return {
        ...message,
        parts: [
          ...parts,
          { type: "tool", id: event.id, name: event.name, label: event.label, state: "running" },
        ],
      };
    case "tool-end": {
      const found = parts.some((p) => p.type === "tool" && p.id === event.id);
      const done = { label: event.label, state: event.ok ? ("done" as const) : ("error" as const) };
      return {
        ...message,
        parts: found
          ? parts.map((p) => (p.type === "tool" && p.id === event.id ? { ...p, ...done } : p))
          : [...parts, { type: "tool", id: event.id, name: "", ...done }],
      };
    }
    case "card":
      return { ...message, parts: [...parts, { type: "card", card: event.card }] };
    case "usage":
      return { ...message, model: event.model, cost: message.cost + (event.cost ?? 0) };
    case "error":
      return { ...message, parts: [...parts, { type: "error", message: event.message }] };
  }
}

function updateMessage(id: string, update: (m: ChatMessage) => ChatMessage) {
  chat.set((state) => ({
    ...state,
    messages: state.messages.map((m) => (m.id === id ? update(m) : m)),
  }));
}

/** Sends a question. `caseId` is the case on screen, if any. */
export function sendChat(text: string, caseId?: string | null) {
  const question = text.trim();
  if (!question || chat.get().busy) return;
  const history: ChatRequest["messages"] = chat
    .get()
    .messages.map((m) => ({ role: m.role, content: textOf(m) }))
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
  chat.set((state) => ({ messages: [...state.messages, user, reply], busy: true }));

  const current = new AbortController();
  controller = current;
  // The route takes the last 40 turns; older ones drop off the front.
  const turns = [...history, { role: "user" as const, content: question }]
    .slice(-40)
    .map((m) => ({ ...m, content: m.content.slice(0, 8000) }));
  const body: ChatRequest = { messages: turns, caseId: caseId ?? null };

  void (async () => {
    try {
      const response = await openStream("/api/chat", body, current.signal);
      for await (const event of readEvents<ChatEvent>(response, current.signal)) {
        updateMessage(reply.id, (m) => reduce(m, event));
      }
    } catch (error) {
      if (!current.signal.aborted) {
        updateMessage(reply.id, (m) => reduce(m, { type: "error", message: errorMessage(error) }));
      }
    } finally {
      updateMessage(reply.id, (m) => ({
        ...m,
        streaming: false,
        parts: m.parts.map((p) =>
          p.type === "tool" && p.state === "running" ? { ...p, state: "done" } : p,
        ),
      }));
      chat.set((state) => ({ ...state, busy: false }));
      if (controller === current) controller = null;
    }
  })();
}

/** Stops the answer that's streaming. */
export function stopChat() {
  controller?.abort();
}

export function clearChat() {
  controller?.abort();
  chat.set({ messages: [], busy: false });
}

export function useChat(): ChatState {
  return useStore(chat);
}
