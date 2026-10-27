import { postJson } from "./api";
import type { CartLine } from "./cart";

/**
 * The demo shop's checkout calls. The server prices every order again from the catalog, so the
 * browser only says what's in the bag.
 */

export interface ShopConfig {
  /** PayPal's client ID is public by design; null when PayPal isn't connected. */
  clientId: string | null;
}

type Ids = {
  id?: string;
  orderId?: string;
  paypalOrderId?: string;
  order?: { id?: string; paypalOrderId?: string | null };
};

/** Creates the PayPal order and returns its ID for the PayPal buttons. */
export async function createShopOrder(lines: CartLine[]): Promise<string> {
  const body = await postJson<Ids>("/api/shop/orders", {
    items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
  });
  const id =
    body.paypalOrderId ?? body.id ?? body.orderId ?? body.order?.paypalOrderId ?? undefined;
  if (!id) throw new Error("PayPal didn't return an order. Try again.");
  return id;
}

/** Captures the approved payment; returns the shop's order number when the server sends one. */
export async function captureShopOrder(paypalOrderId: string): Promise<string | null> {
  const body = await postJson<Ids>(`/api/shop/orders/${encodeURIComponent(paypalOrderId)}/capture`);
  return body.order?.id ?? body.orderId ?? null;
}
