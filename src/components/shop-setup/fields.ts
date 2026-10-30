"use client";

import { useSyncExternalStore } from "react";
import type { ShopPolicies, ShopProfile } from "@/lib/domain";
import { browserTimeZone } from "@/lib/shop-options";
import { issuesToFields, shopPoliciesSchema, shopProfileSchema } from "@/lib/validation";

/**
 * Helpers the shop forms share with the screens that hold them: the ids of each field (to move
 * focus to the first problem), the same checks the server runs, and the server's field errors
 * trimmed to the part of the request a form shows.
 */

export type ProfileErrors = Partial<Record<keyof ShopProfile, string>>;

/** Profile fields in the order they appear, for focusing the first one with a problem. */
export const PROFILE_FIELDS: readonly (keyof ShopProfile)[] = [
  "name",
  "website",
  "currency",
  "timeZone",
  "sells",
];

/** Policy fields in the order they appear, as "shipping.url" and so on. */
export const POLICY_FIELDS = [
  "shipping.url",
  "shipping.text",
  "returns.url",
  "returns.text",
] as const;

/** The id of one field in a shop form: fieldId("shop", "website") → "shop-website". */
export function fieldId(prefix: string, path: string): string {
  return `${prefix}-${path.replace(/\./g, "-")}`;
}

/**
 * Moves focus to the first field, in order, that has an error. True when it found one. A field
 * still disabled from saving gets a few frames to come back before focus moves into it.
 */
export function focusFirstError(
  prefix: string,
  order: readonly string[],
  errors: Record<string, string | undefined>,
): boolean {
  const first = order.find((key) => errors[key]);
  if (!first) return false;
  const id = fieldId(prefix, first);
  const attempt = (left: number) => {
    const el = document.getElementById(id);
    if (!el) return;
    if ((el as HTMLInputElement).disabled && left > 0) {
      requestAnimationFrame(() => attempt(left - 1));
      return;
    }
    el.focus();
  };
  attempt(4);
  return true;
}

/** The server's field errors for one part of a request, without its prefix ("profile.name" → "name"). */
export function fieldsUnder(
  fields: Record<string, string>,
  prefix: string,
): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [key, message] of Object.entries(fields)) {
    if (key.startsWith(`${prefix}.`)) found[key.slice(prefix.length + 1)] = message;
  }
  return found;
}

/** The same errors without one field's, once the person starts fixing it. */
export function without<T extends Record<string, string | undefined>>(errors: T, key: string): T {
  if (!(key in errors)) return errors;
  const next = { ...errors };
  delete next[key];
  return next;
}

/** Checks a profile with the server's own rules; the result is what to send. */
export function checkProfile(
  value: ShopProfile,
): { ok: true; profile: ShopProfile } | { ok: false; errors: ProfileErrors } {
  const result = shopProfileSchema.safeParse(value);
  if (result.success) return { ok: true, profile: result.data };
  return { ok: false, errors: issuesToFields(result.error) as ProfileErrors };
}

/** Checks both policies with the server's own rules; errors are keyed "shipping.url" and so on. */
export function checkPolicies(
  value: ShopPolicies,
): { ok: true; policies: ShopPolicies } | { ok: false; errors: Record<string, string> } {
  const result = shopPoliciesSchema.safeParse(value);
  if (result.success) return { ok: true, policies: result.data };
  return { ok: false, errors: issuesToFields(result.error) };
}

const noop = () => () => {};

/**
 * The browser's time zone once the page runs in the browser, and null while it renders on the
 * server, so the first render always matches the server's.
 */
export function useBrowserTimeZone(): string | null {
  return useSyncExternalStore(noop, browserTimeZone, () => null);
}

/** "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function zoneCity(zone: string): string {
  return (zone.split("/").pop() ?? zone).replace(/_/g, " ");
}

/** A long key, shortened so it can be recognized but not copied: "AbC4…x9Z". */
export function shortKey(key: string): string {
  return key.length > 12 ? `${key.slice(0, 4)}…${key.slice(-3)}` : key;
}
