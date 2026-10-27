import "server-only";

import { createHash } from "node:crypto";
import type { Case, CaseOutcome, SimilarCase } from "@/lib/domain";
import { formatUsd } from "@/lib/money";
import type { Store } from "@/server/store/types";
import type { AiClient } from "./client";
import { requestOptions } from "./loop";
import { REASON_LABEL } from "./prompts";
import { clean } from "./safety";

/**
 * Similar past cases, from Qwen3 embeddings on Token Factory. Vectors are cached by a hash of the
 * model and the text, in the store's shared cache, so a closed case is embedded once for every
 * demo copy. Qwen3's embeddings are trained to be cut short (Matryoshka), so 1,024 of its 4,096
 * dimensions keep the cache small without losing much.
 */
export const EMBED_DIMENSIONS = 1024;
const CACHE_SECONDS = 120 * 24 * 60 * 60;
const QUERY_TASK = "Given a new PayPal dispute, find past disputes about the same problem";

/** What a case is about, in the buyer's own words but without its outcome: the thing to match on. */
export function caseText(kase: Case): string {
  const words = [
    kase.buyerClaim,
    ...kase.messages.filter((m) => m.from === "buyer").map((m) => m.text),
  ];
  const said = [...new Set(words.map((w) => w.trim()))].slice(0, 2).join(" ");
  return `${REASON_LABEL[kase.reason]}: ${kase.itemSummary}. The buyer said: ${clean(said, 600)}`;
}

/** Qwen3 embeds queries with a one-line task; documents go in as they are. */
export function queryText(text: string): string {
  return `Instruct: ${QUERY_TASK}\nQuery: ${text}`;
}

function cacheKey(model: string, text: string): string {
  return `embed:${model}:${createHash("sha256").update(`${EMBED_DIMENSIONS}\n${text}`).digest("hex").slice(0, 40)}`;
}

function normalize(vector: number[]): number[] {
  const cut = vector.slice(0, EMBED_DIMENSIONS);
  const length = Math.hypot(...cut) || 1;
  return cut.map((v) => Math.round((v / length) * 1e6) / 1e6);
}

/** Cosine similarity of two normalized vectors. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) dot += a[i]! * b[i]!;
  return dot;
}

export interface Embedded {
  vectors: number[][];
  /** Null when every vector came from the cache. */
  usage: { prompt_tokens: number } | null;
  ms: number;
  fromCache: number;
}

export async function embedTexts(
  ai: Pick<AiClient, "embeddings">,
  store: Store,
  model: string,
  texts: string[],
  signal?: AbortSignal,
  attemptTimeoutMs?: number,
): Promise<Embedded> {
  const started = Date.now();
  const keys = texts.map((t) => cacheKey(model, t));
  const cached = await Promise.all(keys.map((k) => store.getCached<number[]>(k).catch(() => null)));
  const vectors: (number[] | null)[] = [...cached];
  const missing = vectors.flatMap((v, i) => (v ? [] : [i]));
  let usage: Embedded["usage"] = null;
  if (missing.length > 0) {
    const response = await ai.embeddings.create(
      {
        model,
        input: missing.map((i) => texts[i]!),
        dimensions: EMBED_DIMENSIONS,
        encoding_format: "float",
      },
      requestOptions(signal, attemptTimeoutMs),
    );
    usage = { prompt_tokens: response.usage?.prompt_tokens ?? 0 };
    const writes: Promise<void>[] = [];
    response.data.forEach((item, n) => {
      const index = missing[item.index ?? n];
      if (index === undefined) return;
      const vector = normalize(item.embedding as number[]);
      vectors[index] = vector;
      writes.push(store.setCached(keys[index]!, vector, CACHE_SECONDS).catch(() => undefined));
    });
    await Promise.all(writes);
  }
  if (vectors.some((v) => !v)) throw new Error("The embedding model skipped some texts");
  return {
    vectors: vectors as number[][],
    usage,
    ms: Date.now() - started,
    fromCache: texts.length - missing.length,
  };
}

const OUTCOME: Record<CaseOutcome, string> = {
  won: "won",
  lost: "lost",
  settled: "settled",
  refunded: "refunded",
  buyer_closed: "closed by the buyer",
};

/** "Ember mug candle, item not as described: lost, $28 refunded and a $15 fee." */
export function closedSummary(kase: Case): string {
  const outcome = kase.outcome ? OUTCOME[kase.outcome] : "closed";
  const paid = kase.amount - kase.moneyKept;
  const money: string[] = [];
  if (paid > 0)
    money.push(`${formatUsd(paid)} ${kase.outcome === "settled" ? "partial refund" : "refunded"}`);
  if (kase.feeCharged > 0) money.push(`a ${formatUsd(kase.feeCharged)} fee`);
  if (kase.feeAvoided > 0) money.push(`${formatUsd(kase.feeAvoided)} in fees avoided`);
  return `${kase.itemSummary}, ${REASON_LABEL[kase.reason]}: ${outcome}${money.length ? `, ${money.join(" and ")}` : ""}.`;
}

export interface SimilarSearch {
  similar: SimilarCase[];
  /** False when there was nothing of the same kind to compare, so no model was asked. */
  searched: boolean;
  usage: { prompt_tokens: number } | null;
  ms: number;
}

/**
 * The closed cases most like `kase`, best first: the same kind of dispute, ranked by meaning, above
 * a floor that keeps unrelated ones out.
 */
export async function findSimilar(
  ai: Pick<AiClient, "embeddings">,
  store: Store,
  model: string,
  kase: Case,
  closed: Case[],
  opts: { limit?: number; floor?: number; signal?: AbortSignal; attemptTimeoutMs?: number } = {},
): Promise<SimilarSearch> {
  const pool = closed.filter((c) => c.id !== kase.id && c.reason === kase.reason);
  if (pool.length === 0) return { similar: [], searched: false, usage: null, ms: 0 };
  const texts = [queryText(caseText(kase)), ...pool.map(caseText)];
  const { vectors, usage, ms } = await embedTexts(
    ai,
    store,
    model,
    texts,
    opts.signal,
    opts.attemptTimeoutMs,
  );
  const [query, ...docs] = vectors;
  const similar = pool
    .map((c, i) => ({ kase: c, similarity: cosine(query!, docs[i]!) }))
    .filter((m) => m.similarity >= (opts.floor ?? SIMILAR_FLOOR))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, opts.limit ?? 3)
    .map((m) => ({
      caseId: m.kase.id,
      similarity: Math.round(m.similarity * 1000) / 1000,
      outcome: m.kase.outcome,
      summary: closedSummary(m.kase),
    }));
  return { similar, searched: true, usage, ms };
}

/**
 * Below this, a closed case is about something else. Measured on 27 Oct with Qwen3-Embedding-8B on
 * the demo cases: the cracked mug scores 0.79 against the broken mugs and 0.65 against the cracked
 * jar, but 0.60 against a size complaint.
 */
export const SIMILAR_FLOOR = 0.62;
