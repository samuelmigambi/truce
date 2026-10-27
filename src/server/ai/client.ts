import "server-only";

import OpenAI from "openai";

/** Nebius Token Factory speaks the OpenAI API at this address. */
export const TOKEN_FACTORY_URL = "https://api.tokenfactory.nebius.com/v1/";

let client: OpenAI | null | undefined;

/** The Token Factory client, or null without NEBIUS_API_KEY (Secret Manager in production). */
export function tokenFactory(): OpenAI | null {
  if (client !== undefined) return client;
  const apiKey = process.env.NEBIUS_API_KEY?.trim();
  // A per-call timeout well inside a turn's own deadline; the SDK retries 429s and 5xx itself.
  client = apiKey
    ? new OpenAI({ apiKey, baseURL: TOKEN_FACTORY_URL, timeout: 60_000, maxRetries: 2 })
    : null;
  return client;
}

/** What the agent needs from a chat client; the OpenAI SDK fits, and so do test fakes. */
export type ChatClient = Pick<OpenAI, "chat">;

/** Chat plus embeddings, for the pipeline's similar-cases step. */
export type AiClient = Pick<OpenAI, "chat" | "embeddings">;
