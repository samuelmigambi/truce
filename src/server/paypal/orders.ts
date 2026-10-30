import "server-only";

import type { Address, Order, OrderItem, OrderStatus, Tracking } from "@/lib/domain";
import { toCents } from "@/lib/money";
import { log } from "@/server/log";
import { PayPalError, type PayPal } from "./client";
import { addressOf } from "./map";
import type * as P from "./types";

/**
 * A real shop's orders, from PayPal itself. A disputed payment is looked up capture → order →
 * tracker, which gives what Seller Protection turns on: the amount, PayPal's protection verdict,
 * the address on the payment, the items and the tracking number. Transaction Search gives the
 * order history, when the app has it. There's no carrier API yet, so tracking means the number
 * and PayPal's own status for it, never made-up scans.
 */

const CARRIER_NAMES: Record<string, string> = {
  FEDEX: "FedEx",
  DHL: "DHL",
  UPS: "UPS",
  USPS: "USPS",
};

function trackingOf(tracker: P.Tracker | null): Tracking | null {
  if (!tracker?.tracking_number) return null;
  const code = tracker.carrier === "OTHER" ? tracker.carrier_name_other : tracker.carrier;
  const status = tracker.status?.toUpperCase() ?? "SHIPPED";
  return {
    carrier: code ? (CARRIER_NAMES[code] ?? code) : "Unknown carrier",
    number: tracker.tracking_number,
    uploaded: true,
    deliveredAt: null,
    signedFor: false,
    events: [],
    scans: "none",
    paypalStatus: status,
    shippedAt: tracker.shipment_date ? `${tracker.shipment_date}T12:00:00.000Z` : null,
  };
}

function statusOf(capture: P.CaptureDetails | null, tracking: Tracking | null): OrderStatus {
  const captured = capture?.status?.toUpperCase();
  if (captured === "REFUNDED") return "refunded";
  if (captured === "PARTIALLY_REFUNDED") return "partially_refunded";
  if (tracking?.paypalStatus === "DELIVERED") return "delivered";
  if (tracking) return "shipped";
  return "paid";
}

const quietly = async <T>(work: () => Promise<T>, what: string): Promise<T | null> => {
  try {
    return await work();
  } catch (error) {
    // A 404 is an older payment the v2 APIs don't know; anything else is logged and skipped.
    if (!(error instanceof PayPalError && (error.status === 404 || error.status === 403))) {
      log.warn("paypal.lookup_failed", { what, error });
    }
    return null;
  }
};

/** A payment's order facts from PayPal, laid over `base` (what the dispute already said). */
export async function orderFromPayPal(
  client: PayPal,
  captureId: string,
  base: Order,
): Promise<Order> {
  const capture = await quietly(() => client.getCapture(captureId), "capture");
  const orderId = capture?.supplementary_data?.related_ids?.order_id ?? null;
  const order = orderId ? await quietly(() => client.getOrder(orderId), "order") : null;
  const unit = order?.purchase_units?.[0];
  const trackerId = unit?.shipping?.trackers?.[0]?.id;
  let tracker = trackerId ? await quietly(() => client.getTracker(trackerId), "tracker") : null;
  if (!tracker) {
    const listed = await quietly(() => client.listTrackers(captureId), "trackers");
    tracker = listed?.trackers?.[0] ?? null;
  }
  const tracking = trackingOf(tracker) ?? base.tracking;
  const address: Address | null = addressOf(unit?.shipping?.address) ?? base.paypalAddress;
  const items: OrderItem[] = unit?.items?.length
    ? unit.items.map((i) => ({
        productId: i.sku || "unknown",
        name: i.name,
        quantity: Math.max(1, Number(i.quantity) || 1),
        unitPrice: i.unit_amount ? toCents(i.unit_amount.value) : 0,
      }))
    : base.items;
  const payer = order?.payer?.name;
  const payerName = [payer?.given_name, payer?.surname].filter(Boolean).join(" ");
  const number =
    capture?.custom_id?.trim() || capture?.invoice_id?.trim() || unit?.custom_id?.trim();
  return {
    ...base,
    id: base.id.startsWith("PP-") && number ? number : base.id,
    paypalOrderId: orderId ?? base.paypalOrderId,
    captureId,
    buyer: {
      name: unit?.shipping?.name?.full_name || payerName || base.buyer.name,
      email: order?.payer?.email_address || base.buyer.email,
    },
    items,
    placedAt: capture?.create_time ?? order?.create_time ?? base.placedAt,
    status: statusOf(capture, tracking),
    amount: capture?.amount ? toCents(capture.amount.value) : base.amount,
    protection: capture?.seller_protection?.status ?? base.protection,
    paypalAddress: address,
    // The label goes to the address on the payment unless Truce knows otherwise.
    shipTo: base.shipTo ?? address,
    tracking,
  };
}

// ---------- Transaction Search ----------

const DAY = 24 * 60 * 60 * 1000;

/** PayPal's date format for Transaction Search: seconds, with an offset. */
function searchDate(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "-0000");
}

/** 31-day windows covering the last `days` days, newest first. */
export function searchWindows(now: number, days = 90): { startDate: string; endDate: string }[] {
  const windows: { startDate: string; endDate: string }[] = [];
  let end = now;
  const since = now - days * DAY;
  while (end > since) {
    const start = Math.max(since, end - 31 * DAY + 1000);
    windows.push({ startDate: searchDate(start), endDate: searchDate(end) });
    end = start - 1000;
  }
  return windows;
}

/** Whether a transaction is a payment the shop received (T00xx codes, money in, not denied). */
export function isSale(tx: P.Transaction): boolean {
  const info = tx.transaction_info;
  const code = info.transaction_event_code ?? "";
  const value = Number(info.transaction_amount?.value ?? 0);
  const status = info.transaction_status?.toUpperCase() ?? "S";
  return (
    /^T00\d\d$/.test(code) && value > 0 && (status === "S" || status === "P" || status === "V")
  );
}

/** A sale from Transaction Search as an order. Its tracking isn't known until it's looked up. */
export function orderFromTransaction(tx: P.Transaction): Order {
  const info = tx.transaction_info;
  const amount = toCents(info.transaction_amount?.value ?? "0");
  const items = (tx.cart_info?.item_details ?? []).filter((i) => i.item_name);
  const name = tx.payer_info?.payer_name;
  const shipping = tx.shipping_info?.address;
  const address: Address | null = shipping?.line1
    ? {
        line1: shipping.line1,
        line2: shipping.line2,
        city: shipping.city ?? "",
        state: shipping.state ?? "",
        postalCode: shipping.postal_code ?? "",
        country: shipping.country_code ?? "",
      }
    : null;
  return {
    id: info.invoice_id?.trim() || info.custom_field?.trim() || `PP-${info.transaction_id}`,
    paypalOrderId: null,
    captureId: info.transaction_id,
    buyer: {
      name:
        tx.shipping_info?.name?.trim() ||
        name?.alternate_full_name?.trim() ||
        [name?.given_name, name?.surname].filter(Boolean).join(" ") ||
        "PayPal buyer",
      email: tx.payer_info?.email_address ?? "",
    },
    items: items.length
      ? items.map((i) => ({
          productId: "unknown",
          name: i.item_name!,
          quantity: Math.max(1, Number(i.item_quantity) || 1),
          unitPrice: i.item_unit_price ? toCents(i.item_unit_price.value) : 0,
        }))
      : [{ productId: "unknown", name: "PayPal payment", quantity: 1, unitPrice: amount }],
    placedAt: info.transaction_initiation_date
      ? new Date(info.transaction_initiation_date).toISOString()
      : new Date().toISOString(),
    status: info.transaction_status?.toUpperCase() === "V" ? "refunded" : "paid",
    amount,
    protection: null,
    paypalAddress: address,
    shipTo: address,
    tracking: null,
  };
}

/** Every sale in the last `days` days, a bounded number of pages. Throws PayPalError (403 when the feature is off). */
export async function listSales(
  client: PayPal,
  now: number,
  options: { days?: number; maxPages?: number } = {},
): Promise<Order[]> {
  const orders = new Map<string, Order>();
  let pages = 0;
  const maxPages = options.maxPages ?? 12;
  for (const window of searchWindows(now, options.days ?? 90)) {
    for (let page = 1; pages < maxPages; page++) {
      pages++;
      const result = await client.searchTransactions({ ...window, page, pageSize: 500 });
      for (const tx of result.transaction_details ?? []) {
        if (isSale(tx)) orders.set(tx.transaction_info.transaction_id, orderFromTransaction(tx));
      }
      if (!result.total_pages || page >= result.total_pages) break;
    }
  }
  return [...orders.values()];
}

/** Fills in what Truce lacks on a stored order from a fresher one, keeping what it already knew. */
export function mergeOrder(stored: Order | undefined, fresh: Order): Order {
  if (!stored) return fresh;
  return {
    ...fresh,
    ...stored,
    paypalAddress: stored.paypalAddress ?? fresh.paypalAddress,
    shipTo: stored.shipTo ?? fresh.shipTo,
    tracking: stored.tracking ?? fresh.tracking,
    protection: stored.protection ?? fresh.protection,
    items: stored.items.some((i) => i.productId !== "unknown" || i.name !== "PayPal payment")
      ? stored.items
      : fresh.items,
  };
}
