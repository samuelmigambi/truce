import type { CaptureResponse } from "@/lib/api-types";
import { ActionError, respond } from "@/server/actions/errors";
import { captureShopOrder } from "@/server/actions/shop";
import { checkOrigin, clientIp } from "@/server/auth/guard";
import { enforceLimit } from "@/server/limits";
import { paypal } from "@/server/paypal";
import { paypalConfigFromEnv } from "@/server/paypal/client";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * Takes the approved payment in the demo storefront, then records the order in every shop
 * connected to the storefront's PayPal app, where its disputes sync and its checks run.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    checkOrigin(request);
    const { id } = await params;
    if (!/^[A-Z0-9]{8,32}$/.test(id)) throw new ActionError(400, "That isn't a PayPal order ID.");
    const store = getStore();
    await enforceLimit(
      `capture:${clientIp(request.headers)}`,
      30,
      60 * 60,
      "That's a lot of payments in an hour. Try again in a little while.",
      store,
    );
    const result: CaptureResponse = await captureShopOrder({
      store,
      paypal: paypal(),
      clientId: paypalConfigFromEnv()?.clientId ?? null,
      paypalOrderId: id,
    });
    return Response.json(result);
  });
}
