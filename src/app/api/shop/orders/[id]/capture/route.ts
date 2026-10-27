import type { CaptureResponse } from "@/lib/api-types";
import { captureShopOrder } from "@/server/actions/shop";
import { ActionError, respond } from "@/server/actions/errors";
import { rateLimit } from "@/server/limits";
import { paypal } from "@/server/paypal";
import { clientIp, currentWorkspace } from "@/server/session";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * Takes the approved payment, then saves the order to the live workspace and to the visitor's own
 * demo copy, where its before-shipping checks show up.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await params;
    if (!/^[A-Z0-9]{8,32}$/.test(id)) throw new ActionError(400, "That isn't a PayPal order ID.");
    const store = getStore();
    if (!(await rateLimit(`capture:${clientIp(request.headers)}`, 30, 60 * 60, store))) {
      throw new ActionError(
        429,
        "That's a lot of payments in an hour. Try again in a little while.",
      );
    }
    const result: CaptureResponse = await captureShopOrder({
      store,
      paypal: paypal(),
      paypalOrderId: id,
      // Makes the visitor's demo copy if they shopped before opening the app.
      visitor: await currentWorkspace(),
    });
    return Response.json(result);
  });
}
