import "server-only";

import type { CaptureResponse } from "@/lib/api-types";
import { productById, SHOP } from "@/lib/catalog";
import type { Order, OrderItem, Workspace } from "@/lib/domain";
import { toPayPalValue, type Cents } from "@/lib/money";
import { PayPalError, type PayPal } from "@/server/paypal/client";
import { capturedOrder } from "@/server/paypal/map";
import type * as P from "@/server/paypal/types";
import { ensureLiveWorkspace, LIVE_WORKSPACE_ID } from "@/server/session";
import type { Store } from "@/server/store";
import { ActionError } from "./errors";

/**
 * Checkout in the demo shop, on PayPal's sandbox. Prices always come from the catalog on the
 * server, never from the cart. A captured order lands in the live workspace, where its disputes
 * will sync, and in the visitor's own demo copy, so they can try the before-shipping check on it.
 */

export interface CartLine {
  productId: string;
  quantity: number;
}

interface PendingCheckout {
  number: string;
  items: OrderItem[];
  amount: Cents;
}

const LIVE_FIRST_NUMBER = 1044;
/** Long enough that the order counter's window never rolls over. */
const FOREVER_SECONDS = 100 * 365 * 24 * 60 * 60;
const CHECKOUT_TTL_SECONDS = 6 * 60 * 60;
const checkoutKey = (paypalOrderId: string) => `checkout:${paypalOrderId}`;

/** The cart as order lines, priced from the catalog; the same product twice becomes one line. */
export function priceCart(lines: CartLine[]): { items: OrderItem[]; amount: Cents } {
  const quantities = new Map<string, number>();
  for (const line of lines)
    quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
  const items = [...quantities].map(([productId, quantity]) => {
    const product = productById(productId);
    if (!product) throw new ActionError(400, "One of those items isn't in the shop anymore.");
    if (quantity > 10) throw new ActionError(400, `Ten of each is the most we can send at once.`);
    return { productId, name: product.name, quantity, unitPrice: product.price };
  });
  if (items.length === 0) throw new ActionError(400, "The cart is empty.");
  return { items, amount: items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0) };
}

/** The live shop's next order number, after the sandbox test orders W-1042 to W-1044. */
export async function nextLiveNumber(store: Store): Promise<string> {
  for (let tries = 0; tries < 5; tries++) {
    const n = await store.increment("live-order-number", 1, FOREVER_SECONDS);
    const id = `W-${LIVE_FIRST_NUMBER + n}`;
    if (!(await store.getOrder(LIVE_WORKSPACE_ID, id))) return id;
  }
  throw new ActionError(500, "Couldn't number the order. Try again.");
}

/** The next free number in a demo copy, after its newest order. */
export function nextDemoNumber(orders: Order[]): string {
  const top = orders.reduce((max, o) => Math.max(max, Number(/^W-(\d+)$/.exec(o.id)?.[1] ?? 0)), 0);
  return `W-${Math.max(top, 1102) + 1}`;
}

export function paypalOrderBody(number: string, items: OrderItem[], amount: Cents): P.CreateOrder {
  const usd = (cents: Cents) => ({ currency_code: "USD", value: toPayPalValue(cents) });
  return {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: number,
        custom_id: number,
        description: `${SHOP.name} order ${number}`,
        amount: { ...usd(amount), breakdown: { item_total: usd(amount) } },
        items: items.map((i) => ({
          name: i.name,
          quantity: String(i.quantity),
          unit_amount: usd(i.unitPrice),
          sku: i.productId,
        })),
      },
    ],
  };
}

function checkoutRefusal(error: unknown, doing: string): ActionError {
  if (!(error instanceof PayPalError)) {
    console.error(`[shop] PayPal unreachable while ${doing}`, error);
    return new ActionError(502, "Couldn't reach PayPal. Try again in a moment.");
  }
  const details = Array.isArray(error.details) ? (error.details as { issue?: string }[]) : [];
  const issue = details[0]?.issue ?? error.issue;
  if (issue === "INSTRUMENT_DECLINED")
    return new ActionError(402, "PayPal declined that payment. Try another way to pay.");
  if (issue === "ORDER_NOT_APPROVED")
    return new ActionError(409, "The payment wasn't approved in PayPal yet.");
  if (issue === "ORDER_ALREADY_CAPTURED")
    return new ActionError(409, "This order was already paid.");
  console.error(`[shop] PayPal refused while ${doing}`, error.status, issue, error.debugId);
  return new ActionError(502, `PayPal couldn't finish ${doing} (${issue}). Try again in a moment.`);
}

export async function createShopOrder(input: {
  store: Store;
  paypal: PayPal | null;
  lines: CartLine[];
  requestId: string;
}): Promise<{ id: string; orderId: string }> {
  if (!input.paypal) throw new ActionError(503, "Checkout isn't connected to PayPal here.");
  const { items, amount } = priceCart(input.lines);
  const number = await nextLiveNumber(input.store);
  let created: P.Order;
  try {
    created = await input.paypal.createOrder(
      paypalOrderBody(number, items, amount),
      input.requestId,
    );
  } catch (error) {
    throw checkoutRefusal(error, "starting the payment");
  }
  const pending: PendingCheckout = { number, items, amount };
  await input.store.setCached(checkoutKey(created.id), pending, CHECKOUT_TTL_SECONDS);
  return { id: created.id, orderId: number };
}

export async function captureShopOrder(input: {
  store: Store;
  paypal: PayPal | null;
  paypalOrderId: string;
  visitor: Workspace | null;
  now?: Date;
}): Promise<CaptureResponse> {
  const { store, paypalOrderId } = input;
  const now = input.now ?? new Date();
  if (!input.paypal) throw new ActionError(503, "Checkout isn't connected to PayPal here.");
  let captured: P.Order;
  try {
    // The same request ID on a retry returns the first capture instead of failing.
    captured = await input.paypal.captureOrder(paypalOrderId, `capture-${paypalOrderId}`);
  } catch (error) {
    throw checkoutRefusal(error, "taking the payment");
  }
  const facts = capturedOrder(captured);
  const capture = captured.purchase_units?.[0]?.payments?.captures?.[0];
  if (
    !facts.captureId ||
    !capture ||
    capture.status === "DECLINED" ||
    capture.status === "FAILED"
  ) {
    throw new ActionError(
      402,
      "PayPal didn't complete the payment. Try again, or use another way to pay.",
    );
  }

  const pending = await store.getCached<PendingCheckout>(checkoutKey(paypalOrderId));
  const number =
    pending?.number ?? captured.purchase_units?.[0]?.custom_id ?? (await nextLiveNumber(store));
  const payer = captured.payer?.name;
  const order: Order = {
    id: number,
    paypalOrderId,
    captureId: facts.captureId,
    buyer: {
      name:
        facts.shipToName ??
        ([payer?.given_name, payer?.surname].filter(Boolean).join(" ") || "PayPal buyer"),
      email: facts.payerEmail ?? "",
    },
    items: pending?.items ?? [
      { productId: "unknown", name: `${SHOP.name} order`, quantity: 1, unitPrice: facts.amount },
    ],
    placedAt: now.toISOString(),
    status: "paid",
    amount: facts.amount,
    protection: facts.protection,
    paypalAddress: facts.paypalAddress,
    // Labels go to the address on the payment, which keeps Seller Protection.
    shipTo: facts.paypalAddress,
    tracking: null,
  };
  await ensureLiveWorkspace(store, now);
  await store.saveOrder(LIVE_WORKSPACE_ID, order);

  let orderId = number;
  if (input.visitor?.kind === "demo") {
    const orders = await store.listOrders(input.visitor.id);
    orderId = orders.find((o) => o.paypalOrderId === paypalOrderId)?.id ?? nextDemoNumber(orders);
    await store.saveOrder(input.visitor.id, { ...order, id: orderId });
  }
  return { orderId, liveOrderId: number, status: capture.status, amount: facts.amount };
}
