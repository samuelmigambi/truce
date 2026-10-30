import type { ChatCard, ChatEvent } from "./api-types";

/**
 * Ask Truce conversations, as the browser shows them and as the server saves them. Both build a
 * reply the same way, from the stream of ChatEvents, so a chat reopened later reads exactly as it
 * did while it streamed: the words, the lookup chips, the cards and any error.
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

/** One saved conversation. Each belongs to one person in one shop; nobody else sees it. */
export interface ChatThread {
  id: string;
  uid: string;
  /** The first question, shortened: how the chat shows in the list. */
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

/** A chat as the list shows it, without its messages. */
export interface ChatSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

/** Saved chats keep their newest messages, enough for a long conversation. */
export const MAX_SAVED_MESSAGES = 80;

const TITLE_LENGTH = 80;

/** A chat's title from its first question: one line, shortened at a word where it can be. */
export function titleFrom(question: string): string {
  const line = question.replace(/\s+/g, " ").trim();
  if (line.length <= TITLE_LENGTH) return line;
  const cut = line.slice(0, TITLE_LENGTH);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, "")}…`;
}

export function textOf(message: ChatMessage): string {
  return message.parts
    .filter((p): p is Extract<ChatPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Folds one streamed event into the reply it belongs to. */
export function applyChatEvent(message: ChatMessage, event: ChatEvent): ChatMessage {
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
    case "chat":
      return message;
  }
}

/** A reply that has stopped streaming: lookups still marked running are done. */
export function finishMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    streaming: false,
    parts: message.parts.map((p) =>
      p.type === "tool" && p.state === "running" ? { ...p, state: "done" } : p,
    ),
  };
}

export function summaryOf(thread: ChatThread): ChatSummary {
  return {
    id: thread.id,
    title: thread.title,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    messageCount: thread.messages.length,
  };
}
