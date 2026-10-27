import { errorResponse } from "@/server/actions/errors";
import { paypal, paypalExtras, paypalWebhookId } from "@/server/paypal";
import { syncDispute, syncDisputes } from "@/server/paypal/sync";
import {
  disputeIdOf,
  isDisputeEvent,
  verifyWebhook,
  type WebhookEvent,
} from "@/server/paypal/webhook";
import { ensureLiveWorkspace } from "@/server/session";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * PayPal's dispute webhooks (created, updated, resolved). The signature is checked with PayPal
 * before anything is read; then the dispute syncs into the live workspace.
 */
export async function POST(request: Request) {
  const client = paypal();
  const extras = paypalExtras();
  const webhookId = paypalWebhookId();
  if (!client || !extras || !webhookId)
    return errorResponse(503, "PayPal webhooks aren't set up here.");

  const raw = await request.text();
  if (!(await verifyWebhook(extras, webhookId, request.headers, raw))) {
    return errorResponse(400, "The webhook signature didn't check out.");
  }
  const event = JSON.parse(raw) as WebhookEvent;
  if (!isDisputeEvent(event)) return Response.json({ ok: true, ignored: event.event_type ?? null });

  try {
    const store = getStore();
    const workspace = await ensureLiveWorkspace(store);
    const disputeId = disputeIdOf(event);
    if (disputeId) await syncDispute(store, workspace, client, disputeId);
    else await syncDisputes(store, workspace, client);
  } catch (error) {
    // A 500 makes PayPal retry later, which is what we want when the sync failed.
    console.error("[webhook] sync failed", error);
    return errorResponse(500, "Couldn't sync the dispute. PayPal will retry.");
  }
  return Response.json({ ok: true });
}
