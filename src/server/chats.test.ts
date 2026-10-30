import { describe, expect, it } from "vitest";
import type { ChatEvent } from "@/lib/api-types";
import { titleFrom } from "@/lib/chat-thread";
import { ActionError } from "@/server/actions/errors";
import { MemoryStore } from "@/server/store/memory";
import { recordTurn, startTurn } from "./chats";

async function* events(list: ChatEvent[], fail = false): AsyncGenerator<ChatEvent> {
  for (const event of list) yield event;
  if (fail) throw new Error("model went away");
}

async function drain(stream: AsyncIterable<ChatEvent>): Promise<ChatEvent[]> {
  const out: ChatEvent[] = [];
  for await (const event of stream) out.push(event);
  return out;
}

const now = new Date("2026-10-29T10:00:00.000Z");

describe("saved chats", () => {
  it("saves a new chat with its question at once, then the answer as it streamed", async () => {
    const store = new MemoryStore();
    const chat = await startTurn(store, "sh_1", "u1", null, "Which cases are due this week?", now);
    expect(chat.id).toMatch(/^ch_[\w-]{16}$/);
    expect(chat.title).toBe("Which cases are due this week?");
    expect((await store.getChat("sh_1", "u1", chat.id))?.messages).toHaveLength(1);

    const sent = await drain(
      recordTurn(
        store,
        "sh_1",
        chat,
        events([
          { type: "tool-start", id: "t1", name: "list_cases", label: "Reading cases" },
          { type: "tool-end", id: "t1", label: "Read 3 cases", ok: true },
          { type: "text", delta: "Two are " },
          { type: "text", delta: "due." },
        ]),
        () => now,
      ),
    );
    expect(sent[0]).toEqual({ type: "chat", id: chat.id, title: chat.title });
    expect(sent).toHaveLength(5);

    const saved = await store.getChat("sh_1", "u1", chat.id);
    expect(saved?.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(saved?.messages[1]?.parts).toEqual([
      { type: "tool", id: "t1", name: "list_cases", label: "Read 3 cases", state: "done" },
      { type: "text", text: "Two are due." },
    ]);
  });

  it("continues a saved chat, and refuses one that isn't the person's", async () => {
    const store = new MemoryStore();
    const first = await startTurn(store, "sh_1", "u1", null, "First question", now);
    const again = await startTurn(store, "sh_1", "u1", first.id, "Second question", now);
    expect(again.id).toBe(first.id);
    expect(again.title).toBe("First question");
    expect(again.messages).toHaveLength(2);
    await expect(startTurn(store, "sh_1", "u2", first.id, "Peek", now)).rejects.toBeInstanceOf(
      ActionError,
    );
  });

  it("keeps what streamed before a failure, with the error, and still saves", async () => {
    const store = new MemoryStore();
    const chat = await startTurn(store, "sh_1", "u1", null, "Hello", now);
    await expect(
      drain(recordTurn(store, "sh_1", chat, events([{ type: "text", delta: "Half" }], true))),
    ).rejects.toThrow("model went away");
    const parts = (await store.getChat("sh_1", "u1", chat.id))?.messages[1]?.parts;
    expect(parts?.[0]).toEqual({ type: "text", text: "Half" });
    expect(parts?.[1]?.type).toBe("error");
  });

  it("titles a chat from its first question, shortened at a word", () => {
    expect(titleFrom("  Why did   we lose\nthe mug dispute? ")).toBe(
      "Why did we lose the mug dispute?",
    );
    const long = titleFrom(
      "Which of my open cases are worth fighting this week given the fees and the claims ratio line?",
    );
    expect(long.length).toBeLessThanOrEqual(81);
    expect(long.endsWith("…")).toBe(true);
  });
});
