"use client";

import type { Auth, User as FirebaseUser } from "firebase/auth";
import type { AuthConfigResponse, SessionResponse } from "@/lib/api-types";
import { deleteJson, getJson, postJson } from "./api";

export { safeNext } from "@/lib/next-path";

/**
 * Signing in, in the browser. Firebase Authentication runs the ceremony (passwords, Google,
 * verification and reset emails); the server then trades the fresh ID token for an httpOnly
 * session cookie, which is what every page and API route trusts. Firebase loads only when a
 * sign-in action needs it, so the app itself never carries it.
 */

let configLoad: Promise<AuthConfigResponse> | null = null;
let authLoad: Promise<Auth> | null = null;

/** The server's public Firebase config, fetched once per page. */
export function authConfig(): Promise<AuthConfigResponse> {
  configLoad ??= getJson<AuthConfigResponse>("/api/auth/config").catch((error: unknown) => {
    configLoad = null;
    throw error;
  });
  return configLoad;
}

/** A sign-in that didn't work, with a message for the person and Firebase's code. */
export class AuthFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthFailure";
  }
}

const MESSAGES: Record<string, string> = {
  "auth/email-already-in-use": "There's already an account with that email. Sign in instead.",
  "auth/invalid-email": "That doesn't look like an email address.",
  "auth/missing-email": "Enter your email address.",
  "auth/weak-password": "Choose a longer password: at least 8 characters.",
  "auth/missing-password": "Enter your password.",
  "auth/invalid-credential": "That email and password don't match an account.",
  "auth/invalid-login-credentials": "That email and password don't match an account.",
  "auth/wrong-password": "That email and password don't match an account.",
  "auth/user-not-found": "That email and password don't match an account.",
  "auth/user-disabled": "This account has been turned off. Contact support to turn it back on.",
  "auth/too-many-requests": "Too many tries. Wait a few minutes, or reset your password.",
  "auth/network-request-failed": "Can't reach the sign-in service. Check your connection.",
  "auth/popup-closed-by-user": "The Google window closed before you finished.",
  "auth/cancelled-popup-request": "The Google window closed before you finished.",
  "auth/popup-blocked":
    "Your browser blocked the Google window. Allow pop-ups for this site, then try again.",
  "auth/account-exists-with-different-credential":
    "There's already an account with this email. Sign in with your password instead.",
  "auth/operation-not-allowed": "This way of signing in isn't turned on yet.",
  "auth/unauthorized-domain": "Sign-in isn't set up for this address yet.",
  "auth/requires-recent-login": "Sign in again to do that.",
};

function failure(error: unknown, fallback = "Couldn't sign you in. Try again in a moment.") {
  if (error instanceof AuthFailure) return error;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string") return new AuthFailure(code, MESSAGES[code] ?? fallback);
  if (error instanceof Error && error.name === "HttpError")
    return new AuthFailure("server", error.message);
  return new AuthFailure("unknown", fallback);
}

/** Firebase Auth for this page, set up from the server's config (and the emulator, locally). */
async function firebaseAuth(): Promise<Auth> {
  authLoad ??= (async () => {
    const config = await authConfig();
    if (!config.firebase) {
      throw new AuthFailure("not-configured", "Sign-in isn't set up on this server yet.");
    }
    const [{ getApps, initializeApp }, { connectAuthEmulator, getAuth }] = await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
    ]);
    const { appId, ...options } = config.firebase;
    const app = getApps()[0] ?? initializeApp(appId ? { ...options, appId } : options);
    const auth = getAuth(app);
    if (config.emulator && !(auth as Auth & { emulatorConfig?: unknown }).emulatorConfig) {
      connectAuthEmulator(auth, `http://${config.emulator}`, { disableWarnings: true });
    }
    return auth;
  })().catch((error: unknown) => {
    authLoad = null;
    throw error;
  });
  return authLoad;
}

/** Trades the user's fresh ID token for the server's session cookie. */
async function startSession(user: FirebaseUser): Promise<SessionResponse> {
  const idToken = await user.getIdToken(true);
  return postJson<SessionResponse>("/api/auth/session", { idToken });
}

const here = (path: string) => `${window.location.origin}${path}`;

export async function signUp(input: {
  name: string;
  email: string;
  password: string;
}): Promise<SessionResponse> {
  try {
    const auth = await firebaseAuth();
    const { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } =
      await import("firebase/auth");
    const { user } = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
    if (input.name.trim()) await updateProfile(user, { displayName: input.name.trim() });
    // The account works straight away; the link only confirms the address. A failed send can
    // be retried from the app, so it doesn't stop sign-up.
    await sendEmailVerification(user, { url: here("/onboarding") }).catch(() => undefined);
    return await startSession(user);
  } catch (error) {
    throw failure(error, "Couldn't create your account. Try again in a moment.");
  }
}

export async function signIn(input: { email: string; password: string }): Promise<SessionResponse> {
  try {
    const auth = await firebaseAuth();
    const { signInWithEmailAndPassword } = await import("firebase/auth");
    const { user } = await signInWithEmailAndPassword(auth, input.email.trim(), input.password);
    return await startSession(user);
  } catch (error) {
    throw failure(error);
  }
}

export async function signInWithGoogle(): Promise<SessionResponse> {
  try {
    const auth = await firebaseAuth();
    const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const { user } = await signInWithPopup(auth, provider);
    return await startSession(user);
  } catch (error) {
    throw failure(error);
  }
}

/**
 * Sends Firebase's password reset email. It says nothing about whether the account exists, so
 * the page shouldn't either.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  try {
    const auth = await firebaseAuth();
    const { sendPasswordResetEmail } = await import("firebase/auth");
    await sendPasswordResetEmail(auth, email.trim(), { url: here("/signin") });
  } catch (error) {
    const failed = failure(error, "Couldn't send the email. Try again in a moment.");
    // An unknown address isn't news to share.
    if (failed.code === "auth/user-not-found") return;
    throw failed;
  }
}

/**
 * Sends the verification email again. It needs this browser's Firebase sign-in, which a fresh
 * sign-in brings back; "signed-out" means the person should sign in again first.
 */
export async function resendVerification(): Promise<"sent" | "signed-out"> {
  try {
    const auth = await firebaseAuth();
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) return "signed-out";
    const { sendEmailVerification } = await import("firebase/auth");
    await sendEmailVerification(user, { url: here("/onboarding") });
    return "sent";
  } catch (error) {
    throw failure(error, "Couldn't send the email. Try again in a moment.");
  }
}

/** Forgets this browser's Firebase sign-in, without touching the server session. */
async function forgetFirebase(): Promise<void> {
  try {
    const auth = await firebaseAuth();
    const { signOut } = await import("firebase/auth");
    await signOut(auth);
  } catch {
    // Nothing to forget, or Firebase isn't set up: either way there's no sign-in left here.
  }
}

/** A full page load, so nothing from the signed-in app stays in memory. */
const leaveFor = (path: string) => window.location.assign(new URL(path, window.location.origin));

/** Signs this browser out, then opens the sign-in page. */
export async function signOut(): Promise<void> {
  await deleteJson("/api/auth/session").catch(() => undefined);
  await forgetFirebase();
  leaveFor("/signin");
}

/** Ends every session of this account, on every device, then opens the sign-in page. */
export async function signOutEverywhere(): Promise<void> {
  await postJson("/api/auth/sign-out-everywhere");
  await forgetFirebase();
  leaveFor("/signin?signedOut=everywhere");
}

/**
 * The sign-in pages call this as they open: with no server session, a leftover Firebase sign-in
 * in this browser would only disagree with it.
 */
export function clearStaleSignIn(): void {
  void forgetFirebase();
}
