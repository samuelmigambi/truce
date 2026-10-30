import type { ConnectPayPalResponse } from "@/lib/api-types";
import { json, shopRoute } from "@/server/http";
import { enforceLimit } from "@/server/limits";
import { checkPayPal } from "@/server/paypal/connection";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/** Checks the shop's PayPal keys again: features, health, and the webhook. */
export const POST = shopRoute(
  "manage",
  async ({ shop }) => {
    await enforceLimit(
      `paypal-check:${shop.id}`,
      30,
      60 * 60,
      "That's a lot of checks. Try again in a little while.",
    );
    const result: ConnectPayPalResponse = await checkPayPal(getStore(), shop);
    return json(result);
  },
  { ready: false },
);
