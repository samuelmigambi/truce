import "server-only";

import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { z } from "zod";
import type { ChatClient } from "./client";
import { jsonSchemaOf, requestOptions } from "./loop";
import { cachedTokensOf, costOf, reasoningParams, type Usage } from "./models";

/**
 * A structured answer through a forced tool call. Token Factory doesn't list JSON mode for the
 * Nemotron models, but they all take tools. If the arguments don't fit the schema, the model is
 * told what was wrong and gets one more try. Refinements on the schema (checks across fields, or
 * against the case's evidence IDs) are enforced the same way.
 */
export interface JsonQuestion<T> {
  client: ChatClient;
  model: string;
  system: string;
  messages: ChatCompletionMessageParam[];
  name: string;
  description: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  signal?: AbortSignal;
  /** False turns Nemotron's thinking off; judging steps leave it on. */
  thinking?: boolean;
  /** One attempt's timeout, inside the signal's deadline. */
  attemptTimeoutMs?: number;
}

export interface JsonAnswer<T> {
  value: T;
  usage: Usage;
  cost: number | null;
  /** Model calls it took: 1, or 2 after a rejected first try. */
  calls: number;
}

/** A model call that ran but didn't produce a valid answer; it still cost tokens. */
export class JsonAnswerError extends Error {
  constructor(
    message: string,
    readonly usage: Usage,
    readonly cost: number | null,
  ) {
    super(message);
    this.name = "JsonAnswerError";
  }
}

export async function askForJson<T>(q: JsonQuestion<T>): Promise<JsonAnswer<T>> {
  const tool = {
    type: "function" as const,
    function: {
      name: q.name,
      description: q.description,
      parameters: jsonSchemaOf(q.schema),
    },
  };
  const history: ChatCompletionMessageParam[] = [
    { role: "system", content: q.system },
    ...q.messages,
  ];
  const total: Usage = {
    prompt_tokens: 0,
    completion_tokens: 0,
    prompt_tokens_details: { cached_tokens: 0 },
  };
  let calls = 0;
  let lastProblem = "no tool call";

  for (let attempt = 0; attempt < 2; attempt++) {
    const body = {
      model: q.model,
      messages: history,
      tools: [tool],
      tool_choice: { type: "function", function: { name: q.name } },
      max_tokens: q.maxTokens ?? 2000,
      ...reasoningParams(q.thinking),
    } as ChatCompletionCreateParamsNonStreaming;
    const response: ChatCompletion = await q.client.chat.completions.create(
      body,
      requestOptions(q.signal, q.attemptTimeoutMs),
    );
    calls++;
    if (response.usage) {
      total.prompt_tokens += response.usage.prompt_tokens;
      total.completion_tokens = (total.completion_tokens ?? 0) + response.usage.completion_tokens;
      total.prompt_tokens_details!.cached_tokens =
        (total.prompt_tokens_details!.cached_tokens ?? 0) + cachedTokensOf(response.usage as Usage);
    }
    const call = response.choices[0]?.message.tool_calls?.find((c) => c.type === "function");
    if (!call || call.type !== "function") {
      lastProblem =
        response.choices[0]?.finish_reason === "length" ? "ran out of tokens" : "no tool call";
      history.push({ role: "user", content: `Answer by calling ${q.name}.` });
      continue;
    }
    let problem: string;
    try {
      const parsed = q.schema.safeParse(JSON.parse(call.function.arguments));
      if (parsed.success)
        return { value: parsed.data, usage: total, cost: costOf(q.model, total), calls };
      problem = z.prettifyError(parsed.error);
    } catch {
      problem = "The arguments weren't valid JSON.";
    }
    lastProblem = problem;
    history.push(
      { role: "assistant", content: null, tool_calls: [call] },
      {
        role: "tool",
        tool_call_id: call.id,
        content: `Rejected: ${problem} Call ${q.name} again with corrected arguments.`,
      },
    );
  }
  throw new JsonAnswerError(
    `${q.model} didn't return a valid ${q.name} (${lastProblem.split("\n")[0]})`,
    total,
    costOf(q.model, total),
  );
}
