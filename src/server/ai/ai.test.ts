import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ChatClient } from "./client";
import { runAgent, ToolInputError, type AgentEvent, type Tool } from "./loop";
import { costOf, modelFor } from "./models";
import { askForJson } from "./structured";

/** A fake chat client: each call returns the next scripted stream or response. */
function fakeClient(script: unknown[]) {
  const requests: Record<string, unknown>[] = [];
  const client = {
    chat: {
      completions: {
        create: async (body: Record<string, unknown>) => {
          requests.push(structuredClone(body));
          const next = script.shift();
          if (!next) throw new Error("No more scripted replies");
          if (!body.stream) return next;
          return (async function* () {
            yield* next as unknown[];
          })();
        },
      },
    },
  } as unknown as ChatClient;
  return { client, requests };
}

const chunk = (delta: Record<string, unknown>, usage?: Record<string, unknown>) => ({
  choices: [{ index: 0, delta }],
  ...(usage ? { usage } : {}),
});

const lookUp: Tool<{ orderId: string }, { orders: Record<string, string> }> = {
  name: "look_up_tracking",
  description: "Tracking events for an order",
  input: z.object({ orderId: z.string() }),
  pending: "Checking tracking",
  async run({ orderId }, context) {
    const status = context.orders[orderId];
    if (!status) throw new ToolInputError(`No order ${orderId}.`);
    return {
      content: { status },
      label: `Tracking: ${status}`,
      card: { kind: "tracking", orderId },
    };
  },
};

async function collect(generator: AsyncGenerator<AgentEvent, unknown>) {
  const events: AgentEvent[] = [];
  for (;;) {
    const next = await generator.next();
    if (next.done) return { events, summary: next.value };
    events.push(next.value);
  }
}

describe("models", () => {
  it("routes by job, with settings overriding the defaults", () => {
    expect(modelFor("decide", {})).toBe("nvidia/Nemotron-3-Ultra-550b-a55b");
    expect(modelFor("fast", { TRUCE_MODEL_FAST: "nvidia/other" })).toBe("nvidia/other");
  });

  it("prices a call from Token Factory's catalog", () => {
    const cost = costOf("nvidia/Nemotron-3-Ultra-550b-a55b", {
      prompt_tokens: 10_000,
      completion_tokens: 1_000,
    });
    expect(cost).toBeCloseTo(0.013);
    expect(costOf("unknown/model", { prompt_tokens: 1 })).toBeNull();
  });
});

describe("runAgent", () => {
  it("streams text, runs tools between rounds and reports cost", async () => {
    const { client, requests } = fakeClient([
      [
        chunk({
          tool_calls: [
            { index: 0, id: "c1", function: { name: "look_up_tracking", arguments: "" } },
          ],
        }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: '{"orderId":' } }] }),
        chunk({ tool_calls: [{ index: 0, function: { arguments: '"W-1042"}' } }] }),
        chunk({}, { prompt_tokens: 1200, completion_tokens: 30 }),
      ],
      [
        chunk({ content: "It was delivered " }),
        chunk({ content: "on 24 Oct." }),
        chunk(
          {},
          {
            prompt_tokens: 1300,
            completion_tokens: 12,
            prompt_tokens_details: { cached_tokens: 1024 },
          },
        ),
      ],
    ]);
    const { events, summary } = await collect(
      runAgent({
        client,
        model: "nvidia/Nemotron-3_5-Lightning",
        system: "You help sellers.",
        messages: [{ role: "user", content: "Where is order W-1042?" }],
        tools: [lookUp],
        context: { orders: { "W-1042": "delivered" } },
      }),
    );

    expect(events.map((e) => e.type)).toEqual([
      "tool-start",
      "usage",
      "tool-end",
      "card",
      "text",
      "text",
      "usage",
    ]);
    expect(events[2]).toMatchObject({
      type: "tool-end",
      id: "c1",
      label: "Tracking: delivered",
      ok: true,
    });
    expect(summary).toMatchObject({
      rounds: 2,
      toolCalls: 1,
      input: 2500,
      output: 42,
      cached: 1024,
    });
    // The tool's result went back to the model in the second round.
    const second = requests[1]!.messages as { role: string; content: string }[];
    expect(second.at(-1)).toMatchObject({ role: "tool", content: '{"status":"delivered"}' });
  });

  it("hands bad arguments back to the model instead of running the tool", async () => {
    const { client, requests } = fakeClient([
      [
        chunk({
          tool_calls: [
            {
              index: 0,
              id: "c1",
              function: { name: "look_up_tracking", arguments: '{"order":1}' },
            },
          ],
        }),
      ],
      [chunk({ content: "I couldn't find it." })],
    ]);
    const { events } = await collect(
      runAgent({
        client,
        model: "m",
        system: "s",
        messages: [{ role: "user", content: "?" }],
        tools: [lookUp],
        context: { orders: {} },
      }),
    );
    expect(events.find((e) => e.type === "tool-end")).toMatchObject({ ok: false });
    const toolMessage = (requests[1]!.messages as { role: string; content: string }[]).at(-1)!;
    expect(toolMessage.content).toMatch(/Bad arguments/);
  });

  it("makes the last round answer in words", async () => {
    const { client, requests } = fakeClient([
      [
        chunk({
          tool_calls: [
            {
              index: 0,
              id: "c1",
              function: { name: "look_up_tracking", arguments: '{"orderId":"W-1"}' },
            },
          ],
        }),
      ],
      [chunk({ content: "Done." })],
    ]);
    await collect(
      runAgent({
        client,
        model: "m",
        system: "s",
        messages: [{ role: "user", content: "?" }],
        tools: [lookUp],
        context: { orders: { "W-1": "in transit" } },
        maxRounds: 2,
      }),
    );
    expect(requests[0]).toHaveProperty("tools");
    expect(requests[1]).not.toHaveProperty("tools");
  });
});

describe("askForJson", () => {
  const decision = z.object({
    move: z.enum(["fight", "settle", "refund"]),
    reasons: z.array(z.string()).min(1),
  });
  const reply = (args: string) => ({
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "d1", type: "function", function: { name: "record_decision", arguments: args } },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 3000, completion_tokens: 80 },
  });

  it("returns arguments that fit the schema", async () => {
    const { client, requests } = fakeClient([
      reply('{"move":"settle","reasons":["The listing states the size"]}'),
    ]);
    const answer = await askForJson({
      client,
      model: "nvidia/Nemotron-3-Ultra-550b-a55b",
      system: "Decide.",
      messages: [{ role: "user", content: "Case" }],
      name: "record_decision",
      description: "Record the decision",
      schema: decision,
    });
    expect(answer.value.move).toBe("settle");
    expect(requests[0]!.tool_choice).toEqual({
      type: "function",
      function: { name: "record_decision" },
    });
  });

  it("tells the model what was wrong and takes its second try", async () => {
    const { client, requests } = fakeClient([
      reply('{"move":"surrender","reasons":[]}'),
      reply('{"move":"refund","reasons":["The buyer is right"]}'),
    ]);
    const answer = await askForJson({
      client,
      model: "m",
      system: "Decide.",
      messages: [{ role: "user", content: "Case" }],
      name: "record_decision",
      description: "Record the decision",
      schema: decision,
    });
    expect(answer.value.move).toBe("refund");
    const retry = (requests[1]!.messages as { role: string; content: string }[]).at(-1)!;
    expect(retry).toMatchObject({ role: "tool" });
    expect(retry.content).toMatch(/Rejected/);
  });
});
