import "server-only";

import type { App } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";

/**
 * One firebase-admin app for the whole server: Firestore and Authentication share it. It loads
 * on first use, so the memory store and tests never pay for it. With FIREBASE_AUTH_EMULATOR_HOST
 * set, firebase-admin talks to the local Auth emulator instead of the real service.
 */

const APP_NAME = "truce";
let loading: Promise<App> | null = null;

/** The Google Cloud project that holds Truce's data and accounts. */
export function gcpProject(env: Record<string, string | undefined> = process.env): string {
  return env.TRUCE_GCP_PROJECT?.trim() || "truce-disputes";
}

export function adminApp(projectId: string = gcpProject()): Promise<App> {
  loading ??= (async () => {
    const { applicationDefault, getApps, initializeApp } = await import("firebase-admin/app");
    const existing = getApps().find((a) => a.name === APP_NAME);
    if (existing) return existing;
    const emulatedOnly = Boolean(
      process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST,
    );
    // With both emulators there's nothing to sign in to, so no credentials are needed.
    return initializeApp(
      emulatedOnly ? { projectId } : { credential: applicationDefault(), projectId },
      APP_NAME,
    );
  })().catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

export async function adminAuth(): Promise<Auth> {
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(await adminApp());
}
