import { errorResponse } from "@/server/actions/errors";
import { log } from "@/server/log";
import { paypalFor } from "@/server/paypal/connection";
import { syncDispute, syncDisputes } from "@/server/paypal/sync";
import {
  disputeIdOf,
  isDisputeEvent,
  verifyWebhook,
  type WebhookEvent,
} from "@/server/paypal/webhook";
import { isShopId } from "@/server/shops";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * One shop's PayPal dispute webhooks. The signature is checked with PayPal, using that shop's
 * own app and the webhook ID Truce registered on it, before the body is trusted; then the
 * dispute syncs into the shop. A shop Truce doesn't know answers 404 without saying more.
 */
export async function POST(request: Request, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const store = getStore();
  const shop = isShopId(shopId) ? await store.getShop(shopId) : null;
  const webhookId = shop?.paypal?.webhook.status === "registered" ? shop.paypal.webhook.id : null;
  if (!shop || !webhookId) return errorResponse(404, "Not found.");
  const paypal = await paypalFor(store, shop);
  if (!paypal) return errorResponse(404, "Not found.");

  const raw = await request.text();
  if (raw.length > 256 * 1024) return errorResponse(413, "Too large.");
  if (!(await verifyWebhook(paypal.extras, webhookId, request.headers, raw))) {
    log.warn("webhook.bad_signature", { shopId });
    return errorResponse(400, "The webhook signature didn't check out.");
  }
  const event = JSON.parse(raw) as WebhookEvent;
  if (!isDisputeEvent(event)) return Response.json({ ok: true, ignored: event.event_type ?? null });

  try {
    const disputeId = disputeIdOf(event);
    if (disputeId) await syncDispute(store, shop, paypal.client, disputeId);
    else await syncDisputes(store, shop, paypal.client);
    log.info("webhook.synced", { shopId, type: event.event_type, disputeId });
  } catch (error) {
    // A 500 makes PayPal retry later, which is what we want when the sync failed.
    log.error("webhook.sync_failed", { shopId, error });
    return errorResponse(500, "Couldn't sync the dispute. PayPal will retry.");
  }
  return Response.json({ ok: true });
}
