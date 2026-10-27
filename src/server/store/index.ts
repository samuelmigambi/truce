import "server-only";

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SeededStore } from "@/server/demo/overlay";
import { CachedStore } from "./cached";
import { FirestoreStore } from "./firestore";
import { memoryStore } from "./memory";
import type { Store } from "./types";

export type { Store } from "./types";

type Env = Record<string, string | undefined>;

/** The Google Cloud project whose Firestore holds Truce's data. */
export function gcpProject(env: Env = process.env): string {
  return env.TRUCE_GCP_PROJECT?.trim() || "truce-disputes";
}

/**
 * Whether Google's application default credentials are likely to work here: Cloud Run, a key file,
 * the Firestore emulator, or a `gcloud auth application-default login` on this machine.
 */
export function hasGoogleCredentials(
  env: Env = process.env,
  fileExists: (path: string) => boolean = existsSync,
): boolean {
  if (env.FIRESTORE_EMULATOR_HOST || env.K_SERVICE || env.CLOUD_RUN_JOB) return true;
  const keyFile = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (keyFile) return fileExists(keyFile);
  const configDir =
    env.CLOUDSDK_CONFIG?.trim() ||
    (env.APPDATA ? join(env.APPDATA, "gcloud") : join(env.HOME || homedir(), ".config", "gcloud"));
  return fileExists(join(configDir, "application_default_credentials.json"));
}

/** Firestore with credentials, unless TRUCE_STORE=memory; memory otherwise. */
export function chooseStore(
  env: Env = process.env,
  credentials: (env: Env) => boolean = hasGoogleCredentials,
): Store["kind"] {
  const wanted = env.TRUCE_STORE?.trim().toLowerCase();
  if (wanted === "memory") return "memory";
  if (wanted === "firestore") return "firestore";
  return credentials(env) ? "firestore" : "memory";
}

const shared = globalThis as unknown as { __truceStore?: Store };
let chosen: Store["kind"] | null = null;

/**
 * The store for this process; kept on globalThis so hot reloads reuse it. On Firestore, demo
 * copies are worked out from the seed on read (only changes are stored), and a few seconds of
 * in-process read cache lets one page's requests share their reads.
 */
export function getStore(): Store {
  chosen ??= chooseStore();
  if (chosen === "memory") return memoryStore();
  const current = shared.__truceStore;
  // In development, a hot reload brings new classes: build the store again so the new code runs.
  if (current && (current instanceof SeededStore || process.env.NODE_ENV === "production")) {
    return current;
  }
  shared.__truceStore = new SeededStore(new CachedStore(new FirestoreStore(gcpProject())));
  return shared.__truceStore;
}
