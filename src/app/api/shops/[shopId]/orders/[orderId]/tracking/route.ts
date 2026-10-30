import { z } from "zod";
import type { AddTrackingRequest, AddTrackingResponse } from "@/lib/api-types";
import { readBody } from "@/server/actions/errors";
import { addTracking } from "@/server/actions/tracking";
import { json, param, shopRoute } from "@/server/http";
import { enforceLimit } from "@/server/limits";
import { paypalFor } from "@/server/paypal/connection";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

const trackingSchema: z.ZodType<AddTrackingRequest> = z.object({
  carrier: z.enum(["USPS", "UPS", "FEDEX", "DHL"], "Choose USPS, UPS, FedEx or DHL."),
  number: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9 -]{6,38}[A-Za-z0-9]$/,
      "That doesn't look like a tracking number.",
    ),
});

/** Adds tracking to an order: to the shop's PayPal app, or simulated in a sample shop. */
export const POST = shopRoute("act", async ({ request, shop, params }) => {
  const orderId = param(params, "orderId");
  const body = await readBody(request, trackingSchema);
  await enforceLimit(
    `tracking:${shop.id}`,
    60,
    60 * 60,
    "That's a lot of tracking numbers in an hour. Try again in a little while.",
  );
  const store = getStore();
  const paypal = await paypalFor(store, shop);
  const result: AddTrackingResponse = await addTracking({
    store,
    shop,
    orderId,
    request: body,
    paypal: paypal?.client ?? null,
  });
  return json(result);
});
