import "server-only";

import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { z } from "zod";
import type { ChatClient } from "./client";
import { cachedTokensOf, costOf, reasoningParams, type Usage } from "./models";

/**
 * The agent's tool loop on Token Factory. The model picks tools, the server runs them, and the
 * reply streams back as AgentEvents: text as it's written, a chip for each tool call, cards for
 * the app to show, and the cost of every model call.
 */

/** Bad arguments from the model: the message goes back to it so it can fix the call. */
export class ToolInputError extends Error {}

export interface ToolResult {
  /** JSON for the model. */
  content: unknown;
  /** The chip's label once the call is done. */
  label: string;
  /** Something for the app to show, such as a case card. */
  card?: unknown;
  /** Several things to show, such as one card per flagged order. */
  cards?: unknown[];
}

export interface Tool<I = unknown, C = unknown> {
  name: string;
  description: string;
  input: z.ZodType<I>;
  /** The chip's label while the call runs. */
  pending: string;
  run(input: I, context: C): Promise<ToolResult>;
}

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool-start"; id: string; name: string; label: string }
  | { type: "tool-end"; id: string; label: string; ok: boolean }
  | { type: "card"; card: unknown }
  | {
      type: "usage";
      model: string;
      input: number;
      output: number;
      cached: number;
      cost: number | null;
    }
  | { type: "error"; message: string };

export interface AgentRun<C> {
  client: ChatClient;
  model: string;
  system: string;
  messages: ChatCompletionMessageParam[];
  tools: readonly Tool<unknown, C>[];
  context: C;
  signal?: AbortSignal;
  /** Model calls per question, tool rounds included. The last one must answer in words. */
  maxRounds?: number;
  /** Tool calls per question. */
  maxToolCalls?: number;
  maxTokens?: number;
  /** False turns Nemotron's thinking off, so the first word arrives sooner (see reasoningParams). */
  thinking?: boolean;
  /** One attempt's timeout; the SDK retries a timed-out attempt while the run's signal allows. */
  attemptTimeoutMs?: number;
}

export interface AgentSummary {
  rounds: number;
  toolCalls: number;
  input: number;
  output: number;
  cached: number;
  cost: number;
}

/**
 * Limits that make Token Factory's constrained decoding slow: on 27 Oct a forced tool call on
 * Lightning took 17.6 s with a string's minLength and maxLength in its schema and 0.6 s without
 * them (and wrote three times the tokens). The model sees the schema without them; zod still
 * checks every limit on the answer, and a miss goes back to the model to fix.
 */
const SLOW_KEYWORDS = new Set([
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "pattern",
  "format",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
]);

function relax(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(relax);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (SLOW_KEYWORDS.has(key) || key === "$schema") continue;
    // Under "properties" the keys are field names, which may be anything.
    out[key] =
      key === "properties" && value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, relax(sub)]))
        : relax(value);
  }
  return out;
}

/**
 * Options for one request: the caller's signal, and an attempt timeout well inside it, so a hung
 * request is retried instead of using up the whole step.
 */
export function requestOptions(
  signal: AbortSignal | undefined,
  attemptTimeoutMs: number | undefined,
) {
  return {
    signal,
    ...(attemptTimeoutMs ? { timeout: attemptTimeoutMs, maxRetries: 2 } : {}),
  };
}

/** A zod schema as the JSON Schema a tool definition takes, without the keywords that slow decoding. */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  return relax(z.toJSONSchema(schema)) as Record<string, unknown>;
}

/** The tool definitions the model sees, from each tool's zod schema. */
export function toolDefinitions(tools: readonly Tool<unknown, unknown>[]): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: jsonSchemaOf(tool.input),
    },
  }));
}

/**
 * Some deployments put the model's thinking in the content itself, inside a <think> block. The
 * seller never sees it: the block is held back and dropped.
 */
export class ThinkFilter {
  private state: "start" | "thinking" | "open" = "start";
  private buffer = "";

  push(delta: string): string {
    if (this.state === "open") return delta;
    this.buffer += delta;
    if (this.state === "start") {
      const head = this.buffer.trimStart();
      if (head.length < 7 && "<think>".startsWith(head)) return "";
      if (!head.startsWith("<think>")) {
        this.state = "open";
        const out = this.buffer;
        this.buffer = "";
        return out;
      }
      this.state = "thinking";
    }
    const end = this.buffer.indexOf("</think>");
    if (end < 0) return "";
    this.state = "open";
    const out = this.buffer.slice(end + "</think>".length).trimStart();
    this.buffer = "";
    return out;
  }

  /** What's left at the end: a reply that only ever thought says nothing. */
  flush(): string {
    const out = this.state === "start" ? this.buffer : "";
    this.buffer = "";
    return out;
  }
}

interface PendingCall {
  id: string;
  name: string;
  args: string;
}

const LIMIT_NOTE =
  "Tool limit reached for this question. Answer now from what you already have, and offer to look into the rest next.";

export async function* runAgent<C>(run: AgentRun<C>): AsyncGenerator<AgentEvent, AgentSummary> {
  const maxRounds = run.maxRounds ?? 6;
  const maxToolCalls = run.maxToolCalls ?? 10;
  const byName = new Map(run.tools.map((t) => [t.name, t]));
  const definitions = toolDefinitions(run.tools);
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: run.system },
    ...run.messages,
  ];
  const summary: AgentSummary = {
    rounds: 0,
    toolCalls: 0,
    input: 0,
    output: 0,
    cached: 0,
    cost: 0,
  };

  while (summary.rounds < maxRounds) {
    if (run.signal?.aborted) return summary;
    summary.rounds++;
    const finalRound = summary.rounds >= maxRounds || summary.toolCalls >= maxToolCalls;

    const body = {
      model: run.model,
      messages,
      ...(finalRound ? {} : { tools: definitions, tool_choice: "auto" as const }),
      max_tokens: run.maxTokens ?? 4000,
      stream: true,
      stream_options: { include_usage: true },
      ...reasoningParams(run.thinking),
    } as ChatCompletionCreateParamsStreaming;
    const stream = await run.client.chat.completions.create(
      body,
      requestOptions(run.signal, run.attemptTimeoutMs),
    );

    let text = "";
    const thinkFilter = new ThinkFilter();
    const calls = new Map<number, PendingCall>();
    let usage: Usage | null = null;
    for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
      if (chunk.usage) usage = chunk.usage;
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        const shown = thinkFilter.push(delta.content);
        if (shown) {
          text += shown;
          yield { type: "text", delta: shown };
        }
      }
      for (const part of delta.tool_calls ?? []) {
        const call = calls.get(part.index) ?? { id: "", name: "", args: "" };
        if (part.id) call.id = part.id;
        if (part.function?.name) {
          const started = call.name !== "";
          call.name += part.function.name;
          if (!started) {
            const tool = byName.get(call.name);
            yield {
              type: "tool-start",
              id: call.id || `call_${summary.rounds}_${part.index}`,
              name: call.name,
              label: tool?.pending ?? "Working",
            };
          }
        }
        if (part.function?.arguments) call.args += part.function.arguments;
        calls.set(part.index, call);
      }
    }
    const rest = thinkFilter.flush();
    if (rest) {
      text += rest;
      yield { type: "text", delta: rest };
    }

    if (usage) {
      const cached = cachedTokensOf(usage);
      const cost = costOf(run.model, usage);
      summary.input += usage.prompt_tokens;
      summary.output += usage.completion_tokens ?? 0;
      summary.cached += cached;
      summary.cost += cost ?? 0;
      yield {
        type: "usage",
        model: run.model,
        input: usage.prompt_tokens,
        output: usage.completion_tokens ?? 0,
        cached,
        cost,
      };
    }

    const pending = [...calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, call]) => ({ ...call, id: call.id || `call_${summary.rounds}_${index}` }));
    if (pending.length === 0) return summary;

    messages.push({
      role: "assistant",
      content: text || null,
      tool_calls: pending.map((c) => ({
        id: c.id,
        type: "function" as const,
        function: { name: c.name, arguments: c.args || "{}" },
      })),
    });

    // A round's calls run side by side (most are lookups); results come back in the model's order.
    const started = pending.map((call) => {
      if (summary.toolCalls >= maxToolCalls) return { call, outcome: null };
      summary.toolCalls++;
      return { call, outcome: runTool(byName.get(call.name), call, run.context) };
    });
    for (const { call, outcome: running } of started) {
      let content: unknown;
      if (!running) {
        content = { error: LIMIT_NOTE };
        yield { type: "tool-end", id: call.id, label: "Skipped", ok: false };
      } else {
        const outcome = await running;
        content = outcome.ok ? outcome.result.content : { error: outcome.error };
        yield {
          type: "tool-end",
          id: call.id,
          label: outcome.ok ? outcome.result.label : outcome.label,
          ok: outcome.ok,
        };
        if (outcome.ok) {
          const cards = [
            ...(outcome.result.card !== undefined ? [outcome.result.card] : []),
            ...(outcome.result.cards ?? []),
          ];
          for (const card of cards) yield { type: "card", card };
        }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(content) });
    }
  }
  return summary;
}

type Outcome = { ok: true; result: ToolResult } | { ok: false; label: string; error: string };

async function runTool<C>(
  tool: Tool<unknown, C> | undefined,
  call: PendingCall,
  context: C,
): Promise<Outcome> {
  if (!tool)
    return { ok: false, label: "Unknown tool", error: `There is no tool named ${call.name}.` };
  let raw: unknown;
  try {
    raw = JSON.parse(call.args || "{}");
  } catch {
    return {
      ok: false,
      label: tool.pending,
      error: "The arguments weren't valid JSON. Send a JSON object.",
    };
  }
  const parsed = tool.input.safeParse(raw ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      label: tool.pending,
      error: `Bad arguments: ${z.prettifyError(parsed.error)}`,
    };
  }
  try {
    return { ok: true, result: await tool.run(parsed.data, context) };
  } catch (error) {
    if (error instanceof ToolInputError)
      return { ok: false, label: tool.pending, error: error.message };
    console.error(`[agent] ${tool.name} failed`, error);
    return {
      ok: false,
      label: tool.pending,
      error: "That step failed on our side. Answer without it.",
    };
  }
}
