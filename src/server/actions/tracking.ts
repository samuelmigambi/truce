import "server-only";

import type { AddTrackingRequest, AddTrackingResponse, OrderWithChecks } from "@/lib/api-types";
import type { Case, Order, TrackingEvent, Workspace } from "@/lib/domain";
import { shippingChecks } from "@/lib/rules/protection";
import { cityOf } from "@/server/demo/places";
import { seededRng } from "@/server/demo/rng";
import { loadPendingScans, savePendingScans, splitScans } from "@/server/demo/scans";
import { deliveryTime, ORIGIN, scanHistory } from "@/server/demo/usps";
import { PayPalError, type PayPal } from "@/server/paypal/client";
import type { Store } from "@/server/store";
import { ActionError } from "./errors";

/**
 * Adding tracking before an order ships. Seller Protection needs it on the PayPal order, so the
 * live sandbox sends it to PayPal's track API. A demo copy simulates the upload and the carrier's
 * scans, which then arrive over the next few days.
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
  workspace: Workspace;
  orderId: string;
  request: AddTrackingRequest;
  paypal?: PayPal | null;
  now?: Date;
}

export async function addTracking(input: AddTrackingInput): Promise<AddTrackingResponse> {
  const { store, workspace, orderId } = input;
  const now = input.now ?? new Date();
  const order = await store.getOrder(workspace.id, orderId);
  if (!order) throw new ActionError(404, "There's no order with that number here.");
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
  const simulated = workspace.kind === "demo";

  let events: TrackingEvent[];
  if (simulated) {
    events = await simulateScans(store, workspace, order, carrier, number, now);
  } else {
    await uploadToPayPal(input.paypal ?? null, order, carrier, number);
    events = [
      {
        at: now.toISOString(),
        status: "label_created",
        location: ORIGIN.postOffice,
        detail: `Shipping label created; tracking added to the PayPal order`,
      },
    ];
  }

  const updated: Order = {
    ...order,
    status: order.status === "paid" ? "label_created" : order.status,
    tracking: { carrier, number, uploaded: true, deliveredAt: null, signedFor: false, events },
  };
  await store.saveOrder(workspace.id, updated);
  const cases = await store.listCases(workspace.id);
  return { order: withChecks(updated, cases), simulated };
}

async function uploadToPayPal(
  client: PayPal | null,
  order: Order,
  carrier: string,
  number: string,
) {
  if (!client)
    throw new ActionError(503, "PayPal isn't connected here, so the tracking wasn't added.");
  if (!order.paypalOrderId || !order.captureId) {
    throw new ActionError(409, "This order has no PayPal payment to add tracking to.");
  }
  try {
    await client.addTracking(order.paypalOrderId, {
      capture_id: order.captureId,
      tracking_number: number,
      carrier,
      notify_payer: false,
    });
  } catch (error) {
    if (!(error instanceof PayPalError)) {
      console.error("[tracking] PayPal unreachable", error);
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
  workspace: Workspace,
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
  const pending = await loadPendingScans(store, workspace.id);
  pending[order.id] = future;
  await savePendingScans(store, workspace.id, pending);
  return past;
}
