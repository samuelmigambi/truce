import "server-only";

import type { AuthConfigResponse } from "@/lib/api-types";
import { gcpProject } from "@/server/firebase";

type Env = Record<string, string | undefined>;

/**
 * Firebase's web config, read from the environment at request time (it's public: the browser
 * needs it to start sign-in). Null without an API key, and the sign-in pages say so.
 */
export function authConfig(env: Env = process.env): AuthConfigResponse {
  const apiKey = env.FIREBASE_API_KEY?.trim();
  const projectId = gcpProject(env);
  const emulator = env.FIREBASE_AUTH_EMULATOR_HOST?.trim() || null;
  return {
    firebase: apiKey
      ? {
          apiKey,
          authDomain: env.FIREBASE_AUTH_DOMAIN?.trim() || `${projectId}.firebaseapp.com`,
          projectId,
          appId: env.FIREBASE_APP_ID?.trim() || null,
        }
      : emulator
        ? // The emulator takes any key.
          { apiKey: "emulator-key", authDomain: "localhost", projectId, appId: null }
        : null,
    emulator,
    google: env.TRUCE_GOOGLE_SIGN_IN?.trim() === "1",
  };
}

export function authReady(env: Env = process.env): boolean {
  return authConfig(env).firebase !== null;
}
