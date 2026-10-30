import "server-only";

import { PayPal, paypalConfigFromEnv } from "./client";
import { PayPalExtras } from "./extras";

export { PayPal, PayPalError } from "./client";
export { PayPalExtras } from "./extras";

/**
 * The demo storefront's own PayPal app (/shop), from the server's environment. Shops never use
 * it: each connects its own app (see connection.ts).
 */

let client: PayPal | null | undefined;
let extras: PayPalExtras | null | undefined;

/** The storefront's client, from PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET, or null without them. */
export function paypal(): PayPal | null {
  if (client !== undefined) return client;
  const config = paypalConfigFromEnv();
  client = config ? new PayPal(config) : null;
  return client;
}

/** The calls the main client doesn't make (supporting info, webhook checks), with the same keys. */
export function paypalExtras(): PayPalExtras | null {
  if (extras !== undefined) return extras;
  const config = paypalConfigFromEnv();
  extras = config ? new PayPalExtras(config) : null;
  return extras;
}

/** The webhook registered on the storefront's app before shops had their own; not a secret. */
export function paypalWebhookId(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return env.PAYPAL_WEBHOOK_ID?.trim() || null;
}
