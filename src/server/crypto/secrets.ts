import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { SealedSecret } from "@/server/store/types";

/**
 * Secrets at rest, sealed with AES-256-GCM in an envelope: each secret gets its own random data
 * key, the master key (TRUCE_ENCRYPTION_KEY, 32 bytes as base64 or hex, from Secret Manager) wraps
 * that data key, and only ciphertext is stored. The context (which shop, which secret) is bound
 * in as additional data, so a sealed value copied to another shop won't open. A previous master
 * key (TRUCE_ENCRYPTION_KEY_PREVIOUS) can still open old envelopes while keys rotate.
 */

type Env = Record<string, string | undefined>;

interface MasterKey {
  key: Buffer;
  kid: string;
}

export class SecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretError";
  }
}

function parseKey(value: string | undefined): MasterKey | null {
  const raw = value?.trim();
  if (!raw) return null;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new SecretError("The encryption key must be 32 bytes, as base64 or hex.");
  }
  return { key, kid: createHash("sha256").update(key).digest("hex").slice(0, 16) };
}

function keys(env: Env): { current: MasterKey | null; all: MasterKey[] } {
  const current = parseKey(env.TRUCE_ENCRYPTION_KEY);
  const previous = parseKey(env.TRUCE_ENCRYPTION_KEY_PREVIOUS);
  return { current, all: [current, previous].filter((k): k is MasterKey => k !== null) };
}

/** Whether this server can seal secrets (the master key is set and well formed). */
export function encryptionReady(env: Env = process.env): boolean {
  try {
    return keys(env).current !== null;
  } catch {
    return false;
  }
}

function encrypt(key: Buffer, plain: Buffer, aad: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

function decrypt(key: Buffer, box: { iv: string; tag: string; data: string }, aad: string) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64"));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(box.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(box.data, "base64")), decipher.final()]);
}

/** Seals `plain` for `context` (such as "shop:sh_…:paypal"). */
export function sealSecret(
  plain: string,
  context: string,
  now = new Date(),
  env: Env = process.env,
): SealedSecret {
  const { current } = keys(env);
  if (!current)
    throw new SecretError("TRUCE_ENCRYPTION_KEY isn't set, so secrets can't be stored.");
  const dataKey = randomBytes(32);
  try {
    const secret = encrypt(dataKey, Buffer.from(plain, "utf8"), `secret:${context}`);
    const wrapped = encrypt(current.key, dataKey, `key:${context}`);
    return {
      v: 1,
      alg: "A256GCM",
      kid: current.kid,
      key: wrapped,
      ...secret,
      createdAt: now.toISOString(),
    };
  } finally {
    dataKey.fill(0);
  }
}

/** Opens a sealed secret for the same context; throws SecretError if it can't. */
export function openSecret(sealed: SealedSecret, context: string, env: Env = process.env): string {
  if (sealed.v !== 1 || sealed.alg !== "A256GCM") throw new SecretError("Unknown secret format.");
  const master = keys(env).all.find((k) => k.kid === sealed.kid);
  if (!master) throw new SecretError("The key that sealed this secret isn't available.");
  let dataKey: Buffer | null = null;
  try {
    dataKey = decrypt(master.key, sealed.key, `key:${context}`);
    return decrypt(dataKey, sealed, `secret:${context}`).toString("utf8");
  } catch (error) {
    if (error instanceof SecretError) throw error;
    throw new SecretError("The secret couldn't be opened.");
  } finally {
    dataKey?.fill(0);
  }
}
