import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ShopOrderRequest, ShopOrderResponse } from "@/lib/api-types";
import { createShopOrder } from "@/server/actions/shop";
import { ActionError, readBody, respond } from "@/server/actions/errors";
import { rateLimit } from "@/server/limits";
import { paypal } from "@/server/paypal";
import { clientIp } from "@/server/session";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

const cartSchema: z.ZodType<ShopOrderRequest> = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1).max(60),
        quantity: z.number().int().min(1, "Each item needs a quantity of at least 1.").max(10),
      }),
    )
    .min(1, "The cart is empty.")
    .max(20),
});

/** Creates the PayPal order for the cart, priced on the server from the catalog. */
export async function POST(request: Request) {
  return respond(async () => {
    const body = await readBody(request, cartSchema);
    const store = getStore();
    if (!(await rateLimit(`checkout:${clientIp(request.headers)}`, 30, 60 * 60, store))) {
      throw new ActionError(
        429,
        "That's a lot of checkouts in an hour. Try again in a little while.",
      );
    }
    const { id, orderId } = await createShopOrder({
      store,
      paypal: paypal(),
      lines: body.items,
      requestId: randomUUID(),
    });
    const response: ShopOrderResponse = { id, paypalOrderId: id, orderId };
    return Response.json(response);
  });
}
