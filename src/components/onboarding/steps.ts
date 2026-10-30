import type { ShopSummary } from "@/lib/api-types";
import { SETUP_STEPS, type SetupStep, type Shop, type ShopRole } from "@/lib/domain";

/**
 * Onboarding's steps, in order: the shop's setup steps (its furthest one is `setupStep`), then
 * the first sync. The server saves how far the person got, so the flow always resumes from there.
 * The person's name comes from sign-up.
 */

export type StepId = SetupStep | "sync";

export const STEP_ORDER: readonly StepId[] = [...SETUP_STEPS, "sync"];

export function isStepId(value: string | null | undefined): value is StepId {
  return typeof value === "string" && (STEP_ORDER as readonly string[]).includes(value);
}

export function stepIndex(step: StepId): number {
  return STEP_ORDER.indexOf(step);
}

/** Where the person left off, from what the server saved: the step to resume at. */
export function furthestStep(shop: Shop | null): StepId {
  if (!shop) return "details";
  return shop.setupStep;
}

/** Whether the shop has already reached a setup step, so moving on to it needs no save. */
export function shopReached(shop: Shop, step: SetupStep): boolean {
  return SETUP_STEPS.indexOf(shop.setupStep) >= SETUP_STEPS.indexOf(step);
}

/** The address that picks a shop's setup up again, loading what the server saved for it. */
export function resumeHref(shopId: string): string {
  return `/onboarding?shop=${encodeURIComponent(shopId)}`;
}

/** A shop as the account's shop list holds it. */
export function summaryOf(shop: Shop, role: ShopRole): ShopSummary {
  return {
    id: shop.id,
    name: shop.name,
    kind: shop.kind,
    status: shop.status,
    setupStep: shop.setupStep,
    role,
    paypal: shop.paypal
      ? { environment: shop.paypal.environment, health: shop.paypal.health }
      : null,
  };
}

/** The list with this shop added, or brought up to date. */
export function withShop(shops: ShopSummary[], summary: ShopSummary): ShopSummary[] {
  return shops.some((s) => s.id === summary.id)
    ? shops.map((s) => (s.id === summary.id ? summary : s))
    : [...shops, summary];
}
