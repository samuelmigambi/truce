import { errorResponse } from "@/server/actions/errors";
import { log } from "@/server/log";
import { paypal, paypalExtras, paypalWebhookId } from "@/server/paypal";
import { paypalConfigFromEnv } from "@/server/paypal/client";
import { clientIdHash, paypalFor } from "@/server/paypal/connection";
import { syncDispute, syncDisputes } from "@/server/paypal/sync";
import {
  disputeIdOf,
  isDisputeEvent,
  verifyWebhook,
  type WebhookEvent,
} from "@/server/paypal/webhook";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * The demo storefront app's own webhook (PAYPAL_WEBHOOK_ID), registered before shops had their
 * own. It's verified with that app, then the dispute syncs into every shop connected to the same
 * app. New shops get their own webhook at /api/paypal/webhook/[shopId].
 */
export async function POST(request: Request) {
  const client = paypal();
  const extras = paypalExtras();
  const webhookId = paypalWebhookId();
  const clientId = paypalConfigFromEnv()?.clientId;
  if (!client || !extras || !webhookId || !clientId) {
    return errorResponse(503, "PayPal webhooks aren't set up here.");
  }
  const raw = await request.text();
  if (raw.length > 256 * 1024) return errorResponse(413, "Too large.");
  if (!(await verifyWebhook(extras, webhookId, request.headers, raw))) {
    return errorResponse(400, "The webhook signature didn't check out.");
  }
  const event = JSON.parse(raw) as WebhookEvent;
  if (!isDisputeEvent(event)) return Response.json({ ok: true, ignored: event.event_type ?? null });

  const store = getStore();
  const shops = await store.listShopsByPayPalApp(clientIdHash(clientId));
  let failed = 0;
  for (const shop of shops) {
    // A shop with its own webhook on this app hears about it there.
    if (shop.paypal?.webhook.status === "registered") continue;
    try {
      const own = await paypalFor(store, shop);
      if (!own) continue;
      const disputeId = disputeIdOf(event);
      if (disputeId) await syncDispute(store, shop, own.client, disputeId);
      else await syncDisputes(store, shop, own.client);
    } catch (error) {
      failed++;
      log.error("webhook.sync_failed", { shopId: shop.id, error });
    }
  }
  if (failed) return errorResponse(500, "Couldn't sync the dispute. PayPal will retry.");
  return Response.json({ ok: true, shops: shops.length });
}
