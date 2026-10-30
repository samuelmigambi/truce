import "server-only";

import type { AddTrackingRequest, AddTrackingResponse, OrderWithChecks } from "@/lib/api-types";
import type { Case, Order, Shop, Tracking, TrackingEvent } from "@/lib/domain";
import { shippingChecks } from "@/lib/rules/protection";
import { cityOf } from "@/server/demo/places";
import { seededRng } from "@/server/demo/rng";
import { loadPendingScans, savePendingScans, splitScans } from "@/server/demo/scans";
import { deliveryTime, ORIGIN, scanHistory } from "@/server/demo/usps";
import { log } from "@/server/log";
import { PayPalError, type PayPal } from "@/server/paypal/client";
import type { Store } from "@/server/store";
import { ActionError } from "./errors";

/**
 * Adding tracking before an order ships. Seller Protection needs it on the PayPal payment, so a
 * real shop sends it to its PayPal app (the order's track API, or the trackers API for a payment
 * made outside Orders v2). There's no carrier API yet, so a real shop's tracking is the number and
 * PayPal's status for it. A sample shop simulates the upload and the carrier's scans, which then
 * arrive over the next few days, and says so.
 */

const DAY = 24 * 60 * 60 * 1000;

/** An order with the before-shipping checks, and the case on it, if any. */
export function withChecks(order: Order, cases: Case[]): OrderWithChecks {
  return {
    ...order,
    checks: shippingChecks(order),
    caseId: cases.find((c) => c.orderId === order.id)?.id ?? null,
  };
}

const TO_SHIP = new Set<Order["status"]>(["paid", "label_created"]);

/** Orders waiting to ship first, then the rest; newest first within each. */
export function sortOrders<T extends Order>(orders: T[]): T[] {
  return [...orders].sort(
    (a, b) =>
      Number(TO_SHIP.has(b.status)) - Number(TO_SHIP.has(a.status)) ||
      b.placedAt.localeCompare(a.placedAt),
  );
}

/** Tracking numbers without spaces or dashes, in capitals, as carriers print them. */
export function normalizeTrackingNumber(number: string): string {
  return number.replace(/[\s-]/g, "").toUpperCase();
}

export interface AddTrackingInput {
  store: Store;
  shop: Shop;
  orderId: string;
  request: AddTrackingRequest;
  paypal?: PayPal | null;
  now?: Date;
}

export async function addTracking(input: AddTrackingInput): Promise<AddTrackingResponse> {
  const { store, shop, orderId } = input;
  const now = input.now ?? new Date();
  const order = await store.getOrder(shop.id, orderId);
  if (!order) {
    throw new ActionError(404, "There's no order with that number in this shop.", {
      code: "order_not_found",
    });
  }
  if (order.status === "refunded")
    throw new ActionError(409, "This order was refunded, so it won't ship.");
  if (order.tracking?.uploaded) {
    throw new ActionError(
      409,
      `This order already has tracking: ${order.tracking.carrier} ${order.tracking.number}.`,
    );
  }
  const carrier = input.request.carrier;
  const number = normalizeTrackingNumber(input.request.number);
  const simulated = shop.kind === "sample";

  let tracking: Tracking;
  if (simulated) {
    const events = await simulateScans(store, shop, order, carrier, number, now);
    tracking = {
      carrier,
      number,
      uploaded: true,
      deliveredAt: null,
      signedFor: false,
      events,
      scans: "simulated",
    };
  } else {
    if (shop.paypal && !shop.paypal.features.tracking) {
      throw new ActionError(
        409,
        "This shop's PayPal app can't add tracking. Turn on tracking for the app in the PayPal developer dashboard, then check the connection.",
        { code: "paypal_missing_features" },
      );
    }
    await uploadToPayPal(input.paypal ?? null, order, carrier, number);
    tracking = {
      carrier,
      number,
      uploaded: true,
      deliveredAt: null,
      signedFor: false,
      events: [],
      scans: "none",
      paypalStatus: "SHIPPED",
      shippedAt: now.toISOString(),
    };
  }

  const updated: Order = {
    ...order,
    status: order.status === "paid" ? (simulated ? "label_created" : "shipped") : order.status,
    tracking,
  };
  await store.saveOrder(shop.id, updated);
  const cases = await store.listCases(shop.id);
  return { order: withChecks(updated, cases), simulated };
}

async function uploadToPayPal(
  client: PayPal | null,
  order: Order,
  carrier: string,
  number: string,
) {
  if (!client) {
    throw new ActionError(
      409,
      "This shop isn't connected to PayPal, so the tracking wasn't added.",
      {
        code: "paypal_not_connected",
      },
    );
  }
  if (!order.captureId) {
    throw new ActionError(409, "This order has no PayPal payment to add tracking to.");
  }
  try {
    if (order.paypalOrderId) {
      await client.addTracking(order.paypalOrderId, {
        capture_id: order.captureId,
        tracking_number: number,
        carrier,
        notify_payer: false,
      });
    } else {
      const result = await client.addTrackers([
        { transaction_id: order.captureId, tracking_number: number, status: "SHIPPED", carrier },
      ]);
      const refused = result.errors?.[0];
      if (refused) {
        throw new ActionError(
          422,
          `PayPal didn't accept the tracking: ${refused.message ?? refused.name ?? "it gave no reason"}.`,
        );
      }
    }
  } catch (error) {
    if (error instanceof ActionError) throw error;
    if (!(error instanceof PayPalError)) {
      log.warn("tracking.paypal_unreachable", { error });
      throw new ActionError(
        502,
        "Couldn't reach PayPal, so the tracking wasn't added. Try again in a moment.",
      );
    }
    const debug = error.debugId ? ` PayPal debug ID ${error.debugId}.` : "";
    const status = error.status === 400 || error.status === 422 ? 422 : 502;
    throw new ActionError(
      status,
      `PayPal didn't accept the tracking: ${error.message} (${error.issue}).${debug}`,
    );
  }
}

/**
 * The scans a USPS parcel would get from here to the buyer, the label now and the rest over the
 * next days; future ones wait, and arrive as their time comes. Other carriers get the label scan.
 */
async function simulateScans(
  store: Store,
  shop: Shop,
  order: Order,
  carrier: string,
  number: string,
  now: Date,
): Promise<TrackingEvent[]> {
  const labelAt = now.getTime() - 30_000;
  if (carrier !== "USPS") {
    return [
      {
        at: new Date(labelAt).toISOString(),
        status: "label_created",
        location: ORIGIN.postOffice,
        detail: `Shipping label created, ${carrier} awaiting item`,
      },
    ];
  }
  const rng = seededRng(
    [...`${order.id}:${number}`].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7),
  );
  const address = order.shipTo ?? order.paypalAddress;
  const city = address
    ? cityOf(address)
    : cityOf({ line1: "", city: "Portland", state: "OR", postalCode: "97214", country: "US" });
  let deliverAt = deliveryTime(rng, labelAt + rng.int(city.days[0], city.days[1]) * DAY, city);
  while (deliverAt < labelAt + 20 * 60 * 60 * 1000) deliverAt += DAY;
  const scans = scanHistory(rng, {
    labelAt,
    city,
    deliverAt,
    deliveredAt: rng.pick(["mailbox", "porch"] as const),
  });
  const { past, future } = splitScans(scans, now.getTime());
  const pending = await loadPendingScans(store, shop.id);
  pending[order.id] = future;
  await savePendingScans(store, shop.id, pending);
  return past;
}
