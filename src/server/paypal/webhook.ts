import "server-only";

import type { PayPalExtras, WebhookSignature } from "./extras";

/**
 * PayPal webhooks: a request is trusted only after PayPal's verify-webhook-signature says it came
 * from PayPal for this app's webhook. Anything else is turned away before it's read.
 */

/** The signature headers PayPal sends, or null when any is missing. */
export function webhookSignature(headers: Headers): WebhookSignature | null {
  const get = (name: string) => headers.get(name)?.trim() || "";
  const signature: WebhookSignature = {
    authAlgo: get("paypal-auth-algo"),
    certUrl: get("paypal-cert-url"),
    transmissionId: get("paypal-transmission-id"),
    transmissionSig: get("paypal-transmission-sig"),
    transmissionTime: get("paypal-transmission-time"),
  };
  return Object.values(signature).every(Boolean) ? signature : null;
}

/** True only when the headers are all there, the body is JSON, and PayPal confirms the signature. */
export async function verifyWebhook(
  extras: PayPalExtras,
  webhookId: string,
  headers: Headers,
  rawBody: string,
): Promise<boolean> {
  const signature = webhookSignature(headers);
  if (!signature) return false;
  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return false;
  }
  try {
    return await extras.verifyWebhookSignature(webhookId, signature, event);
  } catch (error) {
    console.error("[paypal] webhook verification failed", error);
    return false;
  }
}

export interface WebhookEvent {
  id?: string;
  event_type?: string;
  resource?: { dispute_id?: string; id?: string } & Record<string, unknown>;
}

/** Whether the event is about a dispute (CUSTOMER.DISPUTE.CREATED, .UPDATED or .RESOLVED). */
export function isDisputeEvent(event: WebhookEvent): boolean {
  return typeof event.event_type === "string" && event.event_type.startsWith("CUSTOMER.DISPUTE.");
}

/** The dispute a webhook is about, when it says. */
export function disputeIdOf(event: WebhookEvent): string | null {
  const id = event.resource?.dispute_id ?? event.resource?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}
