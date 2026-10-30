import "server-only";

import type { Shop } from "@/lib/domain";
import { log } from "@/server/log";
import type { Store } from "@/server/store";
import { PayPalError, type PayPal } from "./client";
import { markHealthy, markProblem, paypalFor } from "./connection";
import { listSales, mergeOrder } from "./orders";
import { markSynced, syncDisputes, type SyncOptions, type SyncResult } from "./sync";

/**
 * Bringing a connected shop up to date with its PayPal app: its disputes (with their orders
 * filled in from PayPal), and its sales from Transaction Search when the app has it. Used by the
 * overnight check, webhooks and "Sync now". A shop's sales are read at most every few hours.
 */

const SALES_EVERY_MS = 6 * 60 * 60 * 1000;
const salesKey = (shopId: string) => `sales-sync:${shopId}`;

/** Whether PayPal turned the keys or the app away, rather than failing for a moment. */
export function refused(error: unknown): boolean {
  return error instanceof PayPalError && (error.status === 401 || error.status === 403);
}

export type SalesResult = { orders: number } | { skipped: string };

/**
 * The last 90 days of sales as orders. Transaction Search can be on in the app and still answer
 * 403 for a while (PayPal takes time to enable it), so that's reported, not thrown, and the shop
 * falls back to seeing only disputed orders.
 */
export async function syncSales(
  store: Store,
  shop: Shop,
  client: PayPal,
  now = new Date(),
): Promise<SalesResult> {
  if (!shop.paypal?.features.transactions) {
    return {
      skipped:
        "Transaction Search is off for this PayPal app, so Truce sees only orders with disputes.",
    };
  }
  let sales;
  try {
    sales = await listSales(client, now.getTime());
  } catch (error) {
    if (error instanceof PayPalError && error.status === 403) {
      const latest = (await store.getShop(shop.id)) ?? shop;
      await store.saveShop({ ...latest, orderHistory: "disputes", updatedAt: now.toISOString() });
      return {
        skipped:
          "PayPal hasn't opened Transaction Search to this app yet (it can take a few hours after turning it on), so Truce sees only orders with disputes for now.",
      };
    }
    throw error;
  }
  const stored = new Map((await store.listOrders(shop.id)).map((o) => [o.captureId ?? o.id, o]));
  for (const sale of sales) {
    const before = stored.get(sale.captureId ?? sale.id);
    const merged = mergeOrder(before, sale);
    if (!before || JSON.stringify(before) !== JSON.stringify(merged)) {
      await store.saveOrder(shop.id, merged);
    }
  }
  const latest = (await store.getShop(shop.id)) ?? shop;
  if (latest.orderHistory !== "full") {
    await store.saveShop({ ...latest, orderHistory: "full", updatedAt: now.toISOString() });
  }
  await store.setCached(salesKey(shop.id), now.toISOString(), 24 * 60 * 60);
  return { orders: sales.length };
}

/** Whether the shop's sales are due for another read. */
export async function salesStale(store: Store, shop: Shop, now = new Date()): Promise<boolean> {
  const last = await store.getCached<string>(salesKey(shop.id)).catch(() => null);
  return !last || now.getTime() - Date.parse(last) >= SALES_EVERY_MS;
}

/**
 * Syncs a connected real shop now; null when it isn't connected (or its keys can't be opened).
 * Problems PayPal reports with the keys are recorded on the connection, so the app shows them.
 */
export async function syncShopNow(
  store: Store,
  shop: Shop,
  options: SyncOptions = {},
  now = new Date(),
): Promise<SyncResult | null> {
  if (shop.kind !== "real" || !shop.paypal) return null;
  const paypal = await paypalFor(store, shop);
  if (!paypal) {
    await markProblem(
      store,
      shop,
      "Truce can't open this shop's PayPal keys. Reconnect PayPal.",
      now,
    );
    return null;
  }
  try {
    const result = await syncDisputes(store, shop, paypal.client, options);
    await markSynced(store, shop.id, now);
    if (shop.paypal.features.transactions && (await salesStale(store, shop, now))) {
      await syncSales(store, shop, paypal.client, now).catch((error) =>
        log.warn("sync.sales_failed", { shopId: shop.id, error }),
      );
    }
    const latest = (await store.getShop(shop.id)) ?? shop;
    await store.saveShop({
      ...latest,
      lastSyncAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    await markHealthy(store, latest, now);
    return result;
  } catch (error) {
    if (refused(error)) {
      await markProblem(
        store,
        shop,
        "PayPal turned Truce away with this app's keys. Check the connection in settings.",
        now,
      );
    }
    throw error;
  }
}
