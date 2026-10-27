import "server-only";

/**
 * Which model does which job, routed by difficulty: Lightning for the quick everyday calls, Super VL
 * for drafting, the chat and photos, Ultra for the fight, settle or refund call and for checking
 * every draft. Each one is a setting, so a model can change without a code change.
 */
export type Job = "fast" | "draft" | "decide" | "embed";

const DEFAULTS: Record<Job, string> = {
  fast: "nvidia/Nemotron-3_5-Lightning",
  draft: "nvidia/Nemotron-3.5-Super-VL",
  decide: "nvidia/Nemotron-3-Ultra-550b-a55b",
  embed: "Qwen/Qwen3-Embedding-8B",
};

const SETTINGS: Record<Job, string> = {
  fast: "TRUCE_MODEL_FAST",
  draft: "TRUCE_MODEL_DRAFT",
  decide: "TRUCE_MODEL_DECIDE",
  embed: "TRUCE_MODEL_EMBED",
};

export function modelFor(job: Job, env: Record<string, string | undefined> = process.env): string {
  return env[SETTINGS[job]]?.trim() || DEFAULTS[job];
}

/** Every job's model at once, for a pipeline run or the settings page. */
export function modelsFromEnv(
  env: Record<string, string | undefined> = process.env,
): Record<Job, string> {
  return {
    fast: modelFor("fast", env),
    draft: modelFor("draft", env),
    decide: modelFor("decide", env),
    embed: modelFor("embed", env),
  };
}

/** "Lightning", "Super VL", "Ultra": the short names the app shows. */
export function shortModelName(model: string): string {
  if (/lightning/i.test(model)) return "Lightning";
  if (/super-vl/i.test(model)) return "Super VL";
  if (/ultra/i.test(model)) return "Ultra";
  if (/embedding/i.test(model)) return "Qwen3 embeddings";
  return model.split("/").pop() ?? model;
}

/**
 * Token Factory's prices in dollars per million tokens, from its public catalog on 27 Oct 2026.
 * Cached input has its own rate per model; until it's known, cached tokens count at the input rate.
 */
export const PRICES: Record<string, { input: number; output: number; cachedInput?: number }> = {
  "nvidia/Nemotron-3_5-Lightning": { input: 0.06, output: 0.24 },
  "nvidia/Nemotron-3.5-Super-VL": { input: 0.3, output: 0.9 },
  "nvidia/Nemotron-3-Ultra-550b-a55b": { input: 1, output: 3 },
  "Qwen/Qwen3-Embedding-8B": { input: 0.01, output: 0 },
};

export interface Usage {
  prompt_tokens: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
  /** Token Factory's own count of prompt tokens served from its cache (Lightning and Ultra send it). */
  prompt_cache_hit_tokens?: number | null;
}

/**
 * Cached prompt tokens. Token Factory reports them as `prompt_cache_hit_tokens` on some models and
 * as OpenAI's `prompt_tokens_details.cached_tokens` on others (Super VL), and Ultra sends both.
 */
export function cachedTokensOf(usage: Usage): number {
  return Math.max(
    usage.prompt_cache_hit_tokens ?? 0,
    usage.prompt_tokens_details?.cached_tokens ?? 0,
  );
}

/** What one call cost, in dollars; null for a model without a known price. */
export function costOf(model: string, usage: Usage): number | null {
  const price = PRICES[model];
  if (!price) return null;
  const cached = Math.min(cachedTokensOf(usage), usage.prompt_tokens);
  const fresh = usage.prompt_tokens - cached;
  const cachedRate = price.cachedInput ?? price.input;
  return (
    (fresh * price.input + cached * cachedRate + (usage.completion_tokens ?? 0) * price.output) /
    1e6
  );
}

/**
 * Nemotron thinks before it answers unless the chat template is told not to. Most steps turn it
 * off: on 27 Oct Lightning answered in 0.5 s instead of 2.8 s, and `reasoning_effort` had no
 * effect. Ultra's decision and Super VL's reading of photos keep it on, where it changed answers.
 */
export function reasoningParams(thinking: boolean | undefined): Record<string, unknown> {
  return thinking === false ? { chat_template_kwargs: { enable_thinking: false } } : {};
}
