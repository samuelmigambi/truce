import type { ConnectPayPalResponse, ShopResponse } from "@/lib/api-types";
import { connectPayPalSchema } from "@/lib/validation";
import { readBody } from "@/server/actions/errors";
import { json, shopRoute } from "@/server/http";
import { enforceLimit } from "@/server/limits";
import { connectPayPal, disconnectPayPal } from "@/server/paypal/connection";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * Connects (or reconnects) the shop's PayPal REST app: checks the keys with PayPal, seals the
 * secret, and registers the dispute webhook. The secret is never sent back.
 */
export const POST = shopRoute(
  "manage",
  async ({ request, user, shop }) => {
    await enforceLimit(
      `paypal-connect:${user.uid}`,
      20,
      60 * 60,
      "That's a lot of connection attempts. Try again in a little while.",
    );
    const body = await readBody(request, connectPayPalSchema);
    const result: ConnectPayPalResponse = await connectPayPal({
      store: getStore(),
      shop,
      request: body,
    });
    return json(result);
  },
  { ready: false },
);

/** Disconnects: takes Truce's webhook off the app and forgets the keys. Records stay. */
export const DELETE = shopRoute(
  "manage",
  async ({ shop, role }) => {
    const body: ShopResponse = { shop: await disconnectPayPal(getStore(), shop), role };
    return json(body);
  },
  { ready: false },
);
