import { describe, expect, it } from "vitest";
import type { ChatEvent } from "@/lib/api-types";
import { ToolInputError } from "../loop";
import {
  fakeAi,
  fakeBudget,
  lastText,
  memoryStore,
  reasonEmbeddings,
  systemText,
  textChunks,
  toolCallChunks,
  type AiHandlers,
} from "../testing/fakes";
import { seeded } from "../testing/fixtures";
import { chatTurn, matchCases, type ChatDeps } from "./index";
import {
  claimsRatioTool,
  explainOutcome,
  ordersAtRisk,
  prepareAction,
  type ChatContext,
} from "./tools";

const MODELS = {
  fast: "nvidia/Nemotron-3_5-Lightning",
  draft: "nvidia/Nemotron-3.5-Super-VL",
  decide: "nvidia/Nemotron-3-Ultra-550b-a55b",
  embed: "Qwen/Qwen3-Embedding-8B",
};

async function setup(handlers: AiHandlers = {}) {
  const store = memoryStore();
  const w = await seeded(store);
  const ai = fakeAi({ embed: reasonEmbeddings, ...handlers });
  const budget = fakeBudget();
  const context: ChatContext = {
    store,
    workspace: w.workspace,
    client: ai.client,
    models: MODELS,
    now: w.now,
    budget,
    usage: [],
  };
  const deps = (question: string, extra: Partial<ChatDeps> = {}): ChatDeps => ({
    store,
    client: ai.client,
    workspace: w.workspace,
    budget,
    models: MODELS,
    request: { messages: [{ role: "user", content: question }] },
    now: () => w.now,
    ...extra,
  });
  return { store, w, ai, budget, context, deps };
}

async function collect(events: AsyncIterable<ChatEvent>) {
  const out: ChatEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

describe("chat tools", () => {
  it("finds cases by name, item words or ID", async () => {
    const { w } = await setup();
    expect(matchCases(w.cases, "Sam")[0]?.id).toBe("demo-inr-86");
    expect(matchCases(w.cases, "the mug dispute").map((c) => c.id)).toEqual([
      "demo-damaged-28",
      "demo-mug-dispute",
    ]);
    expect(matchCases(w.cases, "PP-D-48133")[0]?.id).toBe("demo-nad-42");
    expect(matchCases(w.cases, "the")).toEqual([]);
  });

  it("flags the order going to an address PayPal doesn't know, with a drafted note", async () => {
    const { context } = await setup();
    const result = await ordersAtRisk.run({ days: 7 }, context);
    const content = result.content as {
      atRisk: { order: string; draftedNote: string | null; problems: string[] }[];
      clear: string[];
      casesDueWithinDays: { cases: { case: string }[] };
    };
    expect(content.atRisk.map((o) => o.order)).toEqual(["W-1102"]);
    expect(content.atRisk[0]!.problems[0]).toMatch(/differs from PayPal's/);
    expect(content.atRisk[0]!.draftedNote).toMatch(/update the shipping address in PayPal/);
    expect(content.clear).toEqual(["W-1101"]);
    expect(content.casesDueWithinDays.cases.map((c) => c.case)).toEqual(["demo-inr-64"]);
    expect(result.cards).toEqual([{ kind: "order", orderId: "W-1102" }]);
    expect(result.label).toBe("1 order at risk");
  });

  it("explains how the mug dispute was lost", async () => {
    const { context } = await setup();
    const result = await explainOutcome.run({ case: "mug" }, context);
    const content = result.content as {
      case: string;
      summary: string;
      timeline: string[];
      paypalSaid: string[];
    };
    expect(content.case).toBe("demo-mug-dispute");
    expect(content.summary).toBe(
      "2 × Ember mug candle, item not as described: lost, $56 refunded and a $15 fee.",
    );
    expect(content.timeline.join(" ")).toMatch(/No photos of the mugs or of the packing/);
    expect(content.paypalSaid[0]).toMatch(/<untrusted source="paypal">/);
    expect(result.card).toEqual({ kind: "case", caseId: "demo-mug-dispute" });
  });

  it("works out the claims ratio in code", async () => {
    const { context } = await setup();
    const result = await claimsRatioTool.run({}, context);
    expect(result.content).toMatchObject({ sales: 6, claims: 1, line: "1.50%" });
    expect(result.card).toMatchObject({ kind: "metric", label: "Claims ratio, last 90 days" });
  });

  it("prepares a refund as a card for approval, with the seller's words", async () => {
    const { context } = await setup();
    const result = await prepareAction.run(
      {
        case: "Sam",
        move: "refund",
        message: "Hi Sam, so sorry about this. We're refunding you in full.",
      },
      context,
    );
    expect(result.card).toEqual({
      kind: "action",
      caseId: "demo-inr-86",
      move: "refund",
      label: "Refund Sam Rivera $86",
      draft: {
        kind: "refund",
        text: "Hi Sam, so sorry about this. We're refunding you in full.",
        evidenceIds: [],
      },
    });
    expect((result.content as { note: string }).note).toMatch(/Nothing is sent until they approve/);
  });

  it("offers the rules' amount when settling, and refuses offers on a claim", async () => {
    const { context } = await setup();
    const settle = await prepareAction.run({ case: "Priya", move: "settle" }, context);
    expect(settle.card).toMatchObject({
      move: "settle",
      label: "Offer Priya Shah $10",
      draft: { kind: "offer", offerAmount: 1000 },
    });
    await expect(
      prepareAction.run({ case: "Chris", move: "settle" }, context),
    ).rejects.toBeInstanceOf(ToolInputError);
    await expect(prepareAction.run({ case: "Dana", move: "refund" }, context)).rejects.toThrow(
      /No open case/,
    );
  });

  it("uses Truce's checked draft when the move matches the analysis", async () => {
    const { context, store, w } = await setup();
    const draft = {
      kind: "message" as const,
      text: "Hi Sam, USPS shows it was delivered on Oct 24.",
      evidenceIds: ["E3"],
    };
    await store.saveAnalysis(w.workspace.id, {
      caseId: "demo-inr-86",
      recommendation: {
        move: "fight",
        confidence: "high",
        headline: "Fight: it was delivered.",
        reasons: [],
      },
      draft,
    } as never);
    const result = await prepareAction.run({ case: "demo-inr-86", move: "fight" }, context);
    expect(result.card).toMatchObject({ move: "fight", draft, label: "Reply to Sam Rivera" });
  });
});

describe("chatTurn", () => {
  it("streams text, tool chips and the action card, and never sends anything", async () => {
    const { deps, budget } = await setup({
      stream: (body, n) =>
        n === 1
          ? toolCallChunks([
              {
                name: "prepare_action",
                args: {
                  case: "Sam",
                  move: "refund",
                  message: "Hi Sam, we're so sorry. We're refunding the full $86.",
                },
              },
            ])
          : textChunks(
              "The refund for Sam is ready for your approval. Truce's analysis would fight this one: USPS shows it delivered.",
            ),
    });
    const events = await collect(chatTurn(deps("Refund Sam and say sorry")));
    const kinds = events
      .map((e) => e.type)
      .filter((type, i, all) => type !== "text" || all[i - 1] !== "text");
    expect(kinds).toEqual(["tool-start", "usage", "tool-end", "card", "text", "usage"]);
    expect(events.find((e) => e.type === "card")).toMatchObject({
      card: { kind: "action", caseId: "demo-inr-86", move: "refund" },
    });
    expect(events.find((e) => e.type === "tool-end")).toMatchObject({
      ok: true,
      label: "Ready for your approval: Refund Sam Rivera $86",
    });
    expect(budget.spent).toBeGreaterThan(0);
    expect(budget.rateKeys).toEqual(["chat:demo-test"]);
  });

  it("shows each card once and reports embedding costs from tools", async () => {
    const { deps } = await setup({
      stream: (_body, n) =>
        n === 1
          ? toolCallChunks([
              { name: "get_case", args: { case: "Alex" } },
              { name: "similar_cases", args: { case: "Alex" } },
              { name: "get_case", args: { case: "demo-damaged-28" } },
            ])
          : textChunks("The closest past case is the mug dispute, which was lost."),
    });
    const events = await collect(chatTurn(deps("Have we had a case like Alex's before?")));
    expect(events.filter((e) => e.type === "card")).toHaveLength(1);
    expect(
      events.filter((e) => e.type === "usage").map((e) => (e.type === "usage" ? e.model : "")),
    ).toContain(MODELS.embed);
  });

  it("keeps the case on screen in the system prompt and fences tool results", async () => {
    const { deps, ai } = await setup({ stream: () => textChunks("Sam's case is an inquiry.") });
    await collect(
      chatTurn(
        deps("What's this one about?", {
          request: {
            messages: [{ role: "user", content: "What's this one about?" }],
            caseId: "demo-inr-86",
          },
        }),
      ),
    );
    const system = systemText(ai.requests[0]!);
    expect(system).toMatch(/looking at this case: demo-inr-86: Sam Rivera/);
    expect(system).toMatch(/You can't send anything/);
    expect(ai.requests[0]!.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("makes the card when the model only says it did", async () => {
    const { deps, ai } = await setup({
      stream: (_body, n) =>
        n === 1
          ? textChunks("I've prepared a refund for Sam, ready for your approval.")
          : n === 2
            ? toolCallChunks([
                {
                  name: "prepare_action",
                  args: { case: "Sam", move: "refund", message: "Hi Sam, we're so sorry." },
                },
              ])
            : textChunks("It's ready for your approval."),
    });
    const events = await collect(chatTurn(deps("Refund Sam and say sorry")));
    expect(events.find((e) => e.type === "card")).toMatchObject({
      card: { kind: "action", move: "refund", caseId: "demo-inr-86" },
    });
    const nudge = ai.requests[1]!;
    expect(nudge.tools?.map((t) => t.function.name)).toEqual(["prepare_action"]);
    expect(lastText(nudge)).toMatch(/No action card was made yet/);
  });

  it("doesn't push a card for a question", async () => {
    const { deps, ai } = await setup({
      stream: () => textChunks("Fighting looks right: USPS shows it delivered."),
    });
    await collect(chatTurn(deps("Should I refund Sam?")));
    expect(ai.requests).toHaveLength(1);
    const { asksForAction } = await import("./index");
    expect(
      [
        "Refund Sam and say sorry",
        "Please offer Priya $10",
        "Can you reply to Jordan?",
        "go ahead and refund Chris",
      ].map(asksForAction),
    ).toEqual([true, true, true, true]);
    expect(
      ["Should I refund Sam?", "Why did we lose the mug dispute?", "Which orders are at risk?"].map(
        asksForAction,
      ),
    ).toEqual([false, false, false]);
  });

  it("stops at the daily limit, politely", async () => {
    const { deps } = await setup();
    const events = await collect(chatTurn({ ...deps("Hi"), budget: fakeBudget({ limit: 0 }) }));
    expect(events).toEqual([
      {
        type: "error",
        message: expect.stringMatching(/asked 60 questions in this demo copy today/),
      },
    ]);
  });

  it("needs a question", async () => {
    const { deps } = await setup();
    const events = await collect(
      chatTurn({ ...deps("Hi"), request: { messages: [{ role: "assistant", content: "Hello" }] } }),
    );
    expect(events).toEqual([{ type: "error", message: "Ask a question to start." }]);
  });
});
