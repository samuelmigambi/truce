import type { Analysis, Case, CaseEvent, Order, Workspace } from "@/lib/domain";
import type { Store } from "@/server/store/types";
import type { Budget } from "../budget";
import type { AiClient } from "../client";

/**
 * Fakes for the agent's tests: a store in memory, a budget that counts, and a Token Factory that
 * answers each request from handlers keyed by what's being asked (a forced tool by name, a stream,
 * an embedding), so steps that run side by side still get the right reply.
 */

export function memoryStore(): Store & { cache: Map<string, unknown> } {
  const workspaces = new Map<string, Workspace>();
  const orders = new Map<string, Map<string, Order>>();
  const cases = new Map<string, Map<string, Case>>();
  const events = new Map<string, CaseEvent[]>();
  const analyses = new Map<string, Analysis>();
  const cache = new Map<string, unknown>();
  const counters = new Map<string, number>();
  const bucket = <T>(map: Map<string, Map<string, T>>, id: string) => {
    if (!map.has(id)) map.set(id, new Map());
    return map.get(id)!;
  };
  const copy = <T>(value: T): T => structuredClone(value);
  return {
    kind: "memory",
    cache,
    async getWorkspace(id) {
      return workspaces.has(id) ? copy(workspaces.get(id)!) : null;
    },
    async saveWorkspace(workspace) {
      workspaces.set(workspace.id, copy(workspace));
    },
    async clearWorkspace(id) {
      orders.delete(id);
      cases.delete(id);
    },
    async listOrders(ws) {
      return [...bucket(orders, ws).values()].map(copy);
    },
    async getOrder(ws, id) {
      const order = bucket(orders, ws).get(id);
      return order ? copy(order) : null;
    },
    async saveOrder(ws, order) {
      bucket(orders, ws).set(order.id, copy(order));
    },
    async listCases(ws) {
      return [...bucket(cases, ws).values()].map(copy);
    },
    async getCase(ws, id) {
      const kase = bucket(cases, ws).get(id);
      return kase ? copy(kase) : null;
    },
    async saveCase(ws, kase) {
      bucket(cases, ws).set(kase.id, copy(kase));
    },
    async listEvents(ws, caseId) {
      return copy(events.get(`${ws}/${caseId}`) ?? []);
    },
    async addEvent(ws, caseId, event) {
      events.set(`${ws}/${caseId}`, [...(events.get(`${ws}/${caseId}`) ?? []), copy(event)]);
    },
    async getAnalysis(ws, caseId) {
      const a = analyses.get(`${ws}/${caseId}`);
      return a ? copy(a) : null;
    },
    async saveAnalysis(ws, analysis) {
      analyses.set(`${ws}/${analysis.caseId}`, copy(analysis));
    },
    async getCached<T>(key: string) {
      return cache.has(key) ? (copy(cache.get(key)) as T) : null;
    },
    async setCached<T>(key: string, value: T) {
      cache.set(key, copy(value));
    },
    async increment(key, by) {
      const next = (counters.get(key) ?? 0) + by;
      counters.set(key, next);
      return next;
    },
  };
}

export interface CountingBudget extends Budget {
  spent: number;
  rateKeys: string[];
}

/** A budget with `limit` live runs per key and `spentAlready` dollars on today's counter. */
export function fakeBudget(opts: { limit?: number; spentAlready?: number } = {}): CountingBudget {
  const counts = new Map<string, number>();
  const budget: CountingBudget = {
    spent: opts.spentAlready ?? 0,
    rateKeys: [],
    async rateLimit(key, limit) {
      budget.rateKeys.push(key);
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n <= Math.min(limit, opts.limit ?? limit);
    },
    async addSpend(dollars) {
      budget.spent += dollars;
      return budget.spent;
    },
    async spendToday() {
      return budget.spent;
    },
  };
  return budget;
}

/** A request as the fake sees it: the parts the tests look at. */
export interface Body {
  model: string;
  messages: { role: string; content: unknown }[];
  stream?: boolean;
  tools?: { function: { name: string } }[];
  tool_choice?: { function?: { name?: string } } | string;
  chat_template_kwargs?: { enable_thinking?: boolean };
  input?: string[];
  [key: string]: unknown;
}

/** The text of a request's last message. */
export const lastText = (body: Body): string => String(body.messages.at(-1)?.content ?? "");

/** The text of a request's system message. */
export const systemText = (body: Body): string => String(body.messages[0]?.content ?? "");

/** The tool a request forces, if any. */
export const forcedTool = (body: Body): string | undefined =>
  typeof body.tool_choice === "object" ? body.tool_choice.function?.name : undefined;

/** The parts of a request's user message, when it has text and images. */
export const userParts = (body: Body): { type: string; image_url?: { url: string } }[] =>
  (body.messages.find((m) => m.role === "user")?.content as {
    type: string;
    image_url?: { url: string };
  }[]) ?? [];
export type Chunk = {
  choices: { index: number; delta: Record<string, unknown> }[];
  usage?: Record<string, number>;
};

export interface AiHandlers {
  /** Forced tool calls, by tool name: the arguments to answer with. */
  json?: Record<string, (body: Body, call: number) => unknown>;
  /** Streams (the drafter, the agent loops): text, or chunks for tool calls. */
  stream?: (body: Body, call: number) => string | Chunk[];
  /** Plain calls (photo reading, the rewrite): the reply's text. */
  complete?: (body: Body, call: number) => string;
  embed?: (texts: string[]) => number[][];
}

export function textChunks(
  text: string,
  usage = { prompt_tokens: 900, completion_tokens: 120 },
): Chunk[] {
  const pieces = text.match(/.{1,7}/gs) ?? [];
  return [
    ...pieces.map((p) => ({ choices: [{ index: 0, delta: { content: p } }] })),
    { choices: [], usage },
  ];
}

export function toolCallChunks(
  calls: { name: string; args: unknown }[],
  usage = { prompt_tokens: 1200, completion_tokens: 60 },
): Chunk[] {
  return [
    ...calls.map((c, index) => ({
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index,
                id: `c${index + 1}`,
                function: { name: c.name, arguments: JSON.stringify(c.args) },
              },
            ],
          },
        },
      ],
    })),
    { choices: [], usage },
  ];
}

/** A Token Factory stand-in that answers from `handlers` and keeps every request. */
export function fakeAi(handlers: AiHandlers) {
  const requests: Body[] = [];
  const counts = new Map<string, number>();
  const next = (key: string) => {
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    return n;
  };
  const client = {
    chat: {
      completions: {
        create: async (body: Body) => {
          requests.push(structuredClone(body));
          const forced = forcedTool(body);
          if (forced) {
            const handler = handlers.json?.[forced];
            if (!handler) throw new Error(`No handler for ${forced}`);
            const args = await handler(body, next(forced));
            return {
              choices: [
                {
                  index: 0,
                  finish_reason: "tool_calls",
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                      {
                        id: `t-${forced}`,
                        type: "function",
                        function: {
                          name: forced,
                          arguments: typeof args === "string" ? args : JSON.stringify(args),
                        },
                      },
                    ],
                  },
                },
              ],
              usage: { prompt_tokens: 3000, completion_tokens: 400, prompt_cache_hit_tokens: 1000 },
            };
          }
          if (body.stream) {
            if (!handlers.stream) throw new Error("No stream handler");
            const reply = handlers.stream(body, next(`stream:${body.model}`));
            const chunks = typeof reply === "string" ? textChunks(reply) : reply;
            return (async function* () {
              yield* chunks;
            })();
          }
          if (!handlers.complete) throw new Error("No completion handler");
          return {
            choices: [
              {
                index: 0,
                finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: handlers.complete(body, next(`complete:${body.model}`)),
                },
              },
            ],
            usage: {
              prompt_tokens: 1500,
              completion_tokens: 90,
              prompt_tokens_details: { cached_tokens: 0 },
            },
          };
        },
      },
    },
    embeddings: {
      create: async (body: Body) => {
        requests.push(structuredClone(body));
        if (!handlers.embed) throw new Error("No embedding handler");
        const texts = body.input as string[];
        return {
          data: handlers
            .embed(texts)
            .map((embedding, index) => ({ index, embedding, object: "embedding" })),
          usage: { prompt_tokens: texts.length * 20, total_tokens: texts.length * 20 },
        };
      },
    },
  } as unknown as AiClient;
  return { client, requests };
}

/** Embeddings that put texts about the same kind of dispute in the same direction. */
export function reasonEmbeddings(texts: string[]): number[][] {
  const axes = ["item not received", "item not as described", "unauthorized payment", "other"];
  return texts.map((t) => {
    const v = axes.map((axis) => (t.includes(axis) ? 1 : 0));
    // Breakage and size complaints lean apart within "not as described".
    v.push(/crack|broken|pieces/i.test(t) ? 1 : 0, /small|tiny|size|inch/i.test(t) ? 1 : 0);
    return v;
  });
}
