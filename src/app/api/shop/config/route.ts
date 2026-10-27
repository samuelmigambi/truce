import type { ShopConfigResponse } from "@/lib/api-types";
import { paypalConfigFromEnv } from "@/server/paypal/client";

export const dynamic = "force-dynamic";

/** PayPal's client ID for the checkout buttons. It's public by design; the secret never leaves the server. */
export async function GET() {
  const body: ShopConfigResponse = { clientId: paypalConfigFromEnv()?.clientId ?? null };
  return Response.json(body);
}
