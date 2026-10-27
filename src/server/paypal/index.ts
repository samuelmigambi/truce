import "server-only";

import { PayPal, paypalConfigFromEnv } from "./client";
import { PayPalExtras } from "./extras";

export { PayPal, PayPalError } from "./client";
export { PayPalExtras } from "./extras";

let client: PayPal | null | undefined;
let extras: PayPalExtras | null | undefined;

/** The PayPal client from PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (Secret Manager), or null without them. */
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

/** The ID of the webhook registered for this app in PayPal's developer dashboard; not a secret. */
export function paypalWebhookId(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return env.PAYPAL_WEBHOOK_ID?.trim() || null;
}
