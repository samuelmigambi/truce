import "server-only";

import { randomBytes } from "node:crypto";
import type { ShopSummary } from "@/lib/api-types";
import {
  SETUP_STEPS,
  type SetupStep,
  type Shop,
  type ShopMember,
  type ShopProfile,
  type ShopRole,
  type User,
} from "@/lib/domain";
import { DEFAULT_NOTIFICATIONS, EMPTY_POLICIES } from "@/lib/shop-options";
import { ActionError } from "@/server/actions/errors";

/**
 * What a shop is and who may do what in it: IDs, a new shop, members and roles, and the order
 * of the setup steps, which the server enforces so a shop can't skip a step it needs.
 */

/** 96 random bits: shop IDs appear in URLs, and nobody should be able to guess another's. */
export function newShopId(): string {
  return `sh_${randomBytes(12).toString("base64url")}`;
}

export function isShopId(value: unknown): value is string {
  return typeof value === "string" && /^sh_[A-Za-z0-9_-]{16}$/.test(value);
}

/** What each role may do. Only owners exist today; the others are ready for teammates. */
export type Capability = "read" | "act" | "manage" | "own";

const ALLOWED: Record<ShopRole, readonly Capability[]> = {
  owner: ["read", "act", "manage", "own"],
  admin: ["read", "act", "manage"],
  member: ["read", "act"],
};

export function can(role: ShopRole, capability: Capability): boolean {
  return ALLOWED[role].includes(capability);
}

export function roleOf(shop: Shop, uid: string): ShopRole | null {
  if (!shop.memberIds.includes(uid)) return null;
  return shop.members[uid]?.role ?? null;
}

export function ownerMember(user: User, now: Date): ShopMember {
  return {
    uid: user.uid,
    role: "owner",
    email: user.email,
    name: user.name,
    joinedAt: now.toISOString(),
    notifications: { ...DEFAULT_NOTIFICATIONS },
  };
}

/** A real shop at its first step, owned by `user`. */
export function newRealShop(user: User, profile: ShopProfile, now: Date, id = newShopId()): Shop {
  const at = now.toISOString();
  return {
    id,
    kind: "real",
    ...profile,
    status: "setup",
    setupStep: "paypal",
    policies: structuredClone(EMPTY_POLICIES),
    ownerUid: user.uid,
    members: { [user.uid]: ownerMember(user, now) },
    memberIds: [user.uid],
    paypal: null,
    orderHistory: "disputes",
    createdAt: at,
    updatedAt: at,
    readyAt: null,
    lastSyncAt: null,
    lastSweepAt: null,
    seedVersion: null,
    seededAt: null,
  };
}

/** Whether a step's part of the setup is done, so the steps after it can open. */
export function stepComplete(shop: Shop, step: SetupStep): boolean {
  switch (step) {
    case "details":
      return Boolean(shop.name && shop.sells && shop.timeZone && shop.currency);
    case "paypal":
      return shop.kind === "sample" || Boolean(shop.paypal?.features.disputes);
    case "policies":
    case "notifications":
      return SETUP_STEPS.indexOf(shop.setupStep) > SETUP_STEPS.indexOf(step);
    case "review":
      return SETUP_STEPS.slice(0, -1).every((s) => stepComplete(shop, s));
  }
}

const STEP_NEEDS: Record<SetupStep, string> = {
  details: "Add your shop's details first.",
  paypal: "Connect PayPal first: Truce needs your app's dispute access.",
  policies: "Save your policies first.",
  notifications: "Save your notification choices first.",
  review: "Finish the steps before the review first.",
};

/**
 * The shop with its furthest step moved to `to`. Moving back is a no-op (the furthest step is
 * kept); moving forward needs every step before `to` to be complete.
 */
export function advanceTo(shop: Shop, to: SetupStep): Shop {
  const target = SETUP_STEPS.indexOf(to);
  const current = SETUP_STEPS.indexOf(shop.setupStep);
  if (target <= current) return shop;
  for (const step of SETUP_STEPS.slice(0, target)) {
    // Policies and notifications are complete once saved, which the save itself records.
    if (step === "policies" || step === "notifications") continue;
    if (!stepComplete(shop, step)) {
      throw new ActionError(409, STEP_NEEDS[step], { code: "setup_incomplete" });
    }
  }
  return { ...shop, setupStep: to };
}

/** Whether the shop may start its first sync: every step before the review is done. */
export function readyToSync(shop: Shop): boolean {
  return (
    shop.setupStep === "review" && stepComplete(shop, "details") && stepComplete(shop, "paypal")
  );
}

export function shopSummary(shop: Shop, uid: string): ShopSummary {
  return {
    id: shop.id,
    name: shop.name,
    kind: shop.kind,
    status: shop.status,
    setupStep: shop.setupStep,
    role: roleOf(shop, uid) ?? "member",
    paypal: shop.paypal
      ? { environment: shop.paypal.environment, health: shop.paypal.health }
      : null,
  };
}

/** Ready shops first (by name), then the ones still in setup. */
export function sortShops<T extends { status: Shop["status"]; name: string }>(shops: T[]): T[] {
  return [...shops].sort(
    (a, b) =>
      Number(b.status === "ready") - Number(a.status === "ready") || a.name.localeCompare(b.name),
  );
}

/** Where a signed-in person belongs: their last ready shop, any ready shop, or onboarding. */
export function landingPath(user: User, shops: ShopSummary[]): string {
  const ready = shops.filter((s) => s.status === "ready");
  const last = ready.find((s) => s.id === user.lastShopId) ?? ready[0];
  return last ? `/app/${last.id}` : "/onboarding";
}
