import "server-only";

import type { Shop } from "@/lib/domain";

/**
 * What the agent takes from the shop it works for. Everything it writes is on the shop's own
 * calendar and in its own money, and what it says about approving depends on how the shop
 * reaches PayPal.
 */

/** A shop's calendar and money; a whole Shop fits. */
export type ShopLocale = Pick<Shop, "timeZone" | "currency">;

/**
 * Whether Truce sees the shop's sales, so the claims ratio can be worked out: always in a sample
 * shop, and in a real one whose PayPal app has Transaction Search. Otherwise it only sees the
 * orders that have disputes, and the ratio is unknown.
 */
export function salesKnown(shop: Pick<Shop, "kind" | "orderHistory">): boolean {
  return shop.kind === "sample" || shop.orderHistory === "full";
}

/** Where an approved action goes: simulated, PayPal's sandbox, PayPal live, or nowhere yet. */
export type ActionRoute = "simulated" | "sandbox" | "live" | "unconnected";

export function actionRoute(shop: Pick<Shop, "kind" | "paypal">): ActionRoute {
  if (shop.kind === "sample") return "simulated";
  return shop.paypal?.environment ?? "unconnected";
}
