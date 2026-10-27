import { z } from "zod";
import type { AddTrackingResponse } from "@/lib/api-types";
import { ActionError, readBody, respond } from "@/server/actions/errors";
import { addTracking } from "@/server/actions/tracking";
import { rateLimit } from "@/server/limits";
import { paypal } from "@/server/paypal";
import { currentWorkspace } from "@/server/session";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

const trackingSchema = z.object({
  carrier: z.enum(["USPS", "UPS", "FEDEX", "DHL"], "Choose USPS, UPS, FedEx or DHL."),
  number: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9 -]{6,38}[A-Za-z0-9]$/,
      "That doesn't look like a tracking number.",
    ),
});

/** Adds tracking to an order: to PayPal in the live sandbox, simulated in a demo copy. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await params;
    const workspace = await currentWorkspace();
    const body = await readBody(request, trackingSchema);
    if (!(await rateLimit(`tracking:${workspace.id}`, 40, 60 * 60))) {
      throw new ActionError(
        429,
        "That's a lot of tracking numbers in an hour. Try again in a little while.",
      );
    }
    const result: AddTrackingResponse = await addTracking({
      store: getStore(),
      workspace,
      orderId: id,
      request: body,
      paypal: paypal(),
    });
    return Response.json(result);
  });
}
