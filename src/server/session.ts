import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { SHOP } from "@/lib/catalog";
import type { Workspace } from "@/lib/domain";
import { ActionError } from "@/server/actions/errors";
import { isCurrentSeed, seedDemo } from "@/server/demo/seed";
import { rateLimit } from "@/server/limits";
import { getStore, type Store } from "@/server/store";

/**
 * Who's visiting: every visitor gets a private demo copy of the Wick & Ember shop, kept by the
 * httpOnly cookie truce_ws. The owner signs in at /owner with TRUCE_OWNER_KEY to reach the live
 * sandbox workspace; that cookie holds a signature of the key, so it can't be forged.
 */

export const WORKSPACE_COOKIE = "truce_ws";
export const OWNER_COOKIE = "truce_owner";
export const LIVE_WORKSPACE_ID = "live";
/** Demo copies, and their cookie, last a week. */
export const DEMO_DAYS = 7;
const OWNER_DAYS = 30;
const DAY_SECONDS = 24 * 60 * 60;
/** New demo copies one network can make in an hour. */
const NEW_COPIES_PER_HOUR = 30;

export interface CookieOptions {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
}

/** httpOnly so scripts can't read it, lax so links into the app keep it, secure in production. */
export function cookieOptions(
  maxAgeSeconds: number,
  production = process.env.NODE_ENV === "production",
): CookieOptions {
  return { httpOnly: true, sameSite: "lax", secure: production, path: "/", maxAge: maxAgeSeconds };
}

/** A demo workspace ID with 96 random bits, so no one can guess another visitor's copy. */
export function newDemoId(): string {
  return `demo-${randomBytes(12).toString("base64url")}`;
}

export function isDemoId(value: string | undefined): value is string {
  return typeof value === "string" && /^demo-[A-Za-z0-9_-]{16,64}$/.test(value);
}

/** Compares two secrets in constant time, whatever their lengths. */
export function safeEqual(a: string, b: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();
  return timingSafeEqual(digest(a), digest(b));
}

/** The owner cookie's value: an HMAC of a fixed label under the owner key. */
export function ownerToken(ownerKey: string): string {
  return createHmac("sha256", ownerKey).update("truce-owner-v1").digest("base64url");
}

export function ownerKey(env: Record<string, string | undefined> = process.env): string | null {
  return env.TRUCE_OWNER_KEY?.trim() || null;
}

/** Whether a cookie value proves the owner signed in with the current key. */
export function isOwnerToken(token: string | undefined, key: string | null = ownerKey()): boolean {
  if (!token || !key) return false;
  return safeEqual(token, ownerToken(key));
}

export function demoWorkspace(id: string, now: Date): Workspace {
  return {
    id,
    kind: "demo",
    shopName: SHOP.name,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DEMO_DAYS * DAY_SECONDS * 1000).toISOString(),
    lastSweepAt: null,
    seedVersion: null,
  };
}

export function liveWorkspace(now: Date): Workspace {
  return {
    id: LIVE_WORKSPACE_ID,
    kind: "live",
    shopName: SHOP.name,
    createdAt: now.toISOString(),
    expiresAt: null,
    lastSweepAt: null,
    seedVersion: null,
  };
}

/** The live sandbox workspace, made on first use. Its cases come from PayPal, not the seed. */
export async function ensureLiveWorkspace(store: Store, now = new Date()): Promise<Workspace> {
  const existing = await store.getWorkspace(LIVE_WORKSPACE_ID);
  if (existing) return existing;
  const workspace = liveWorkspace(now);
  await store.saveWorkspace(workspace);
  return workspace;
}

/**
 * A demo copy with this ID, fresh from the seed. Keeps the ID, so the visitor's cookie stays good.
 * `brandNew` says no copy ever had this ID, so there's nothing old to remove.
 */
export async function freshDemo(
  store: Store,
  id: string,
  now = new Date(),
  brandNew = false,
): Promise<Workspace> {
  return seedDemo(store, demoWorkspace(id, now), { fresh: brandNew });
}

/** A demo copy as it should be read: re-seeded when it has expired or the seed has changed. */
export async function keepFresh(
  store: Store,
  workspace: Workspace,
  now = new Date(),
): Promise<Workspace> {
  const expired = workspace.expiresAt ? Date.parse(workspace.expiresAt) <= now.getTime() : false;
  if (!expired && isCurrentSeed(workspace.seedVersion)) return workspace;
  return freshDemo(store, workspace.id, now);
}

/** The visitor's network address, for rate limits; Cloud Run puts it first in x-forwarded-for. */
export function clientIp(source: Headers): string {
  const forwarded = source.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || source.get("x-real-ip")?.trim() || "local";
}

/**
 * The visitor's workspace, for route handlers (which can set cookies): the live sandbox for the
 * signed-in owner, otherwise their demo copy, made and seeded on the first request.
 */
export async function currentWorkspace(): Promise<Workspace> {
  const jar = await cookies();
  const store = getStore();
  const now = new Date();
  const wanted = jar.get(WORKSPACE_COOKIE)?.value;
  if (wanted === LIVE_WORKSPACE_ID && isOwnerToken(jar.get(OWNER_COOKIE)?.value)) {
    return ensureLiveWorkspace(store, now);
  }
  const existing = isDemoId(wanted) ? await store.getWorkspace(wanted) : null;
  if (existing?.kind === "demo") {
    const fresh = await keepFresh(store, existing, now);
    // A re-seeded copy lives another week, so its cookie should too.
    if (fresh !== existing)
      jar.set(WORKSPACE_COOKIE, fresh.id, cookieOptions(DEMO_DAYS * DAY_SECONDS));
    return fresh;
  }

  // A new copy: no cookie yet, or one for a copy that's gone. Limited per network; the check
  // runs alongside the (small) write, and a refused copy just expires unused.
  const ip = clientIp(await headers());
  const [allowed, workspace] = await Promise.all([
    rateLimit(`new-copy:${ip}`, NEW_COPIES_PER_HOUR, 60 * 60, store),
    isDemoId(wanted) ? freshDemo(store, wanted, now) : freshDemo(store, newDemoId(), now, true),
  ]);
  if (!allowed) {
    throw new ActionError(429, "Too many new demo copies from your network. Try again in an hour.");
  }
  jar.set(WORKSPACE_COOKIE, workspace.id, cookieOptions(DEMO_DAYS * DAY_SECONDS));
  return workspace;
}

/**
 * The visitor's workspace without making one, for server components (which can't set cookies).
 * Null when the visitor has no copy yet; GET /api/session makes it.
 */
export async function peekWorkspace(): Promise<Workspace | null> {
  const jar = await cookies();
  const store = getStore();
  const wanted = jar.get(WORKSPACE_COOKIE)?.value;
  if (wanted === LIVE_WORKSPACE_ID && isOwnerToken(jar.get(OWNER_COOKIE)?.value)) {
    return store.getWorkspace(LIVE_WORKSPACE_ID);
  }
  return isDemoId(wanted) ? store.getWorkspace(wanted) : null;
}

/** Starts the demo copy over from the seed. The live sandbox can't be reset. */
export async function resetWorkspace(workspace: Workspace): Promise<Workspace> {
  if (workspace.kind !== "demo") {
    throw new ActionError(400, "The live sandbox can't be reset. Its cases come from PayPal.");
  }
  return freshDemo(getStore(), workspace.id, new Date());
}

/** Signs the owner in when the key matches; returns false (and sets nothing) when it doesn't. */
export async function signInOwner(key: string | null): Promise<boolean> {
  const expected = ownerKey();
  if (!key || !expected || !safeEqual(key, expected)) return false;
  const jar = await cookies();
  jar.set(OWNER_COOKIE, ownerToken(expected), cookieOptions(OWNER_DAYS * DAY_SECONDS));
  jar.set(WORKSPACE_COOKIE, LIVE_WORKSPACE_ID, cookieOptions(OWNER_DAYS * DAY_SECONDS));
  return true;
}

/** Back to a demo copy: forgets the owner and the live workspace. */
export async function signOutOwner(): Promise<void> {
  const jar = await cookies();
  jar.delete(OWNER_COOKIE);
  jar.delete(WORKSPACE_COOKIE);
}
