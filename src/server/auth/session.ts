import "server-only";

import { cookies } from "next/headers";
import type { User } from "@/lib/domain";
import { ActionError } from "@/server/actions/errors";
import { rateLimit } from "@/server/limits";
import { log } from "@/server/log";
import { getStore, type Store } from "@/server/store";
import { identity, type TokenClaims } from "./identity";

/**
 * Sessions. The browser signs in with Firebase, then trades the fresh ID token for a Firebase
 * session cookie, which is what the server trusts from then on: httpOnly, so scripts can't read
 * it; lax, so a link from another site keeps you signed in but its forms can't post as you
 * (mutating routes check the Origin too); secure in production; five days. Every request
 * verifies the cookie and checks the account's sessionsValidAfter, so "sign out everywhere"
 * takes effect at once.
 */

export const SESSION_COOKIE = "truce_session";
export const SESSION_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A session is only made from a sign-in this recent, so an old stolen token can't make one. */
const FRESH_SIGN_IN_SECONDS = 5 * 60;

export interface CookieOptions {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
}

export function sessionCookieOptions(
  maxAgeSeconds = (SESSION_DAYS * DAY_MS) / 1000,
  production = process.env.NODE_ENV === "production",
): CookieOptions {
  return { httpOnly: true, sameSite: "lax", secure: production, path: "/", maxAge: maxAgeSeconds };
}

/** A new account's record, from what Firebase knows about it. */
export function newUser(claims: TokenClaims, now: Date): User {
  const at = now.toISOString();
  return {
    uid: claims.uid,
    email: claims.email ?? "",
    emailVerified: claims.email_verified ?? false,
    name: claims.name?.trim().slice(0, 60) ?? "",
    createdAt: at,
    updatedAt: at,
    lastShopId: null,
    onboarding: { shopId: null },
    sessionsValidAfter: null,
  };
}

/** Whether a session issued at `issuedAt` (seconds) was ended by "sign out everywhere". */
export function sessionEnded(user: User, issuedAt: number): boolean {
  if (!user.sessionsValidAfter) return false;
  return issuedAt * 1000 < Date.parse(user.sessionsValidAfter);
}

/** The account behind a session cookie, or null when it isn't a valid, current session. */
export async function userForCookie(
  cookie: string | undefined,
  store: Store = getStore(),
): Promise<User | null> {
  if (!cookie || cookie.length > 4096) return null;
  let claims: TokenClaims;
  try {
    claims = await identity().verifySessionCookie(cookie);
  } catch {
    return null;
  }
  const user = await store.getUser(claims.uid);
  if (!user || sessionEnded(user, claims.iat)) return null;
  return user;
}

/** The signed-in person for this request, or null. */
export async function sessionUser(): Promise<User | null> {
  const jar = await cookies();
  return userForCookie(jar.get(SESSION_COOKIE)?.value);
}

/**
 * Starts a session from a fresh Firebase ID token: checks it, makes or updates the account's
 * record, and sets the cookie. Returns the account.
 */
export async function startSession(
  idToken: string,
  store: Store = getStore(),
  now = new Date(),
): Promise<User> {
  let claims: TokenClaims;
  try {
    claims = await identity().verifyIdToken(idToken);
  } catch {
    throw new ActionError(401, "That sign-in didn't check out. Sign in again.", {
      code: "bad_token",
    });
  }
  if (now.getTime() / 1000 - claims.auth_time > FRESH_SIGN_IN_SECONDS) {
    throw new ActionError(401, "That sign-in is too old to start a session. Sign in again.", {
      code: "stale_sign_in",
    });
  }
  if (!claims.email) {
    throw new ActionError(400, "Truce needs an account with an email address.");
  }
  let cookie: string;
  try {
    cookie = await identity().createSessionCookie(idToken, SESSION_DAYS * DAY_MS);
  } catch (error) {
    log.error("auth.session_cookie_failed", { error });
    throw new ActionError(503, "Couldn't start your session. Try again in a moment.");
  }

  const existing = await store.getUser(claims.uid);
  const user: User = existing
    ? {
        ...existing,
        email: claims.email,
        // A verified address stays verified; Firebase only ever turns it on.
        emailVerified: existing.emailVerified || (claims.email_verified ?? false),
        name: existing.name || (claims.name?.trim().slice(0, 60) ?? ""),
        updatedAt: now.toISOString(),
      }
    : newUser(claims, now);
  await store.saveUser(user);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, cookie, sessionCookieOptions());
  log.info("auth.session_started", { uid: user.uid, isNew: !existing });
  return user;
}

/** Signs this browser out. */
export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/**
 * Ends every session of this account: Firebase revokes its refresh tokens (other browsers can't
 * sign in again silently), and the account remembers the moment, so every session cookie issued
 * before it stops working on its next request.
 */
export async function endAllSessions(
  user: User,
  store: Store = getStore(),
  now = new Date(),
): Promise<void> {
  try {
    await identity().revokeSessions(user.uid);
  } catch (error) {
    // The record below still ends every session; Firebase's tokens expire within the hour.
    log.warn("auth.revoke_failed", { uid: user.uid, error });
  }
  const second = Math.floor(now.getTime() / 1000) * 1000;
  await store.saveUser({
    ...user,
    sessionsValidAfter: new Date(second + 1000).toISOString(),
    updatedAt: now.toISOString(),
  });
  await endSession();
  log.info("auth.signed_out_everywhere", { uid: user.uid });
}

/**
 * Asks Firebase whether the email address is verified now (after the person clicked the link),
 * at most every 10 seconds per account. Returns the account as it stands.
 */
export async function refreshVerification(user: User, store: Store = getStore()): Promise<User> {
  if (user.emailVerified) return user;
  if (!(await rateLimit(`verify-check:${user.uid}`, 1, 10, store))) return user;
  try {
    const account = await identity().getAccount(user.uid);
    if (!account.emailVerified) return user;
    const updated = { ...user, emailVerified: true, updatedAt: new Date().toISOString() };
    await store.saveUser(updated);
    return updated;
  } catch (error) {
    log.warn("auth.verification_check_failed", { uid: user.uid, error });
    return user;
  }
}
