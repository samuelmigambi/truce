import "server-only";

import { createHash } from "node:crypto";
import type { ConnectPayPalRequest, ConnectPayPalResponse } from "@/lib/api-types";
import type {
  PayPalConnection,
  PayPalEnvironment,
  PayPalFeatures,
  PayPalWebhook,
  Shop,
} from "@/lib/domain";
import { ActionError } from "@/server/actions/errors";
import { encryptionReady, openSecret, sealSecret, SecretError } from "@/server/crypto/secrets";
import { log } from "@/server/log";
import type { Store } from "@/server/store";
import { publicOrigin } from "@/server/site";
import { PAYPAL_BASE, PayPal, PayPalError } from "./client";
import { PayPalExtras } from "./extras";

/**
 * A shop's own PayPal connection. The seller pastes their REST app's client ID and secret (the
 * path dispute tools use until PayPal's partner onboarding is open to Truce). Truce gets a token
 * to prove the keys work and reads the app's features from its scopes, seals the secret, and
 * registers a webhook on that app so dispute changes arrive on their own. Nothing here ever
 * returns or logs the secret.
 */

export const SCOPES = {
  disputes: "https://uri.paypal.com/services/disputes/read-seller",
  respond: "https://uri.paypal.com/services/disputes/update-seller",
  transactions: "https://uri.paypal.com/services/reporting/search/read",
  tracking: "https://uri.paypal.com/services/shipping/trackers/readwrite",
  webhooks: "https://uri.paypal.com/services/applications/webhooks",
} as const;

export const DISPUTE_EVENTS = [
  "CUSTOMER.DISPUTE.CREATED",
  "CUSTOMER.DISPUTE.UPDATED",
  "CUSTOMER.DISPUTE.RESOLVED",
];

export function featuresFromScopes(scopes: string[]): PayPalFeatures {
  const has = (scope: string) => scopes.includes(scope);
  return {
    disputes: has(SCOPES.disputes),
    respond: has(SCOPES.respond),
    transactions: has(SCOPES.transactions),
    tracking: has(SCOPES.tracking),
    webhooks: has(SCOPES.webhooks),
  };
}

/** SHA-256 of the client ID: finds the shops on one PayPal app without querying by the ID. */
export function clientIdHash(clientId: string): string {
  return createHash("sha256").update(clientId.trim(), "utf8").digest("hex");
}

/** The sealed secret is bound to the shop and the app, so it can't be paired with another. */
function secretContext(shopId: string, hash: string): string {
  return `paypal:${shopId}:${hash}`;
}

/** "AbC4…x9Z": enough of a client ID to recognise it. */
export function shortClientId(clientId: string): string {
  return clientId.length > 12 ? `${clientId.slice(0, 4)}…${clientId.slice(-3)}` : clientId;
}

/** Where PayPal should send this shop's dispute webhooks, or why it can't. */
export function webhookTarget(
  shopId: string,
  siteUrl: string | null | undefined = process.env.SITE_URL,
): { url: string } | { skip: string } {
  const origin = publicOrigin(siteUrl);
  if (!origin || !origin.startsWith("https://")) {
    return {
      skip: "PayPal only sends updates to a public https address, and this server isn't one yet, so Truce checks PayPal for changes instead: every minute while you're using it, and every night.",
    };
  }
  return { url: `${origin}/api/paypal/webhook/${encodeURIComponent(shopId)}` };
}

const issueOf = (error: PayPalError) => {
  const details = Array.isArray(error.details) ? (error.details as { issue?: string }[]) : [];
  return details[0]?.issue ?? error.issue;
};

/** Registers the dispute webhook on the shop's app, reusing one already there for the same address. */
export async function registerWebhook(client: PayPal, url: string): Promise<PayPalWebhook> {
  try {
    const created = await client.createWebhook(url, DISPUTE_EVENTS);
    return { status: "registered", id: created.id, url, note: null };
  } catch (error) {
    if (error instanceof PayPalError && issueOf(error) === "WEBHOOK_URL_ALREADY_EXISTS") {
      const existing = (await client.listWebhooks().catch(() => ({ webhooks: [] }))).webhooks?.find(
        (w) => w.url === url,
      );
      if (existing) return { status: "registered", id: existing.id, url, note: null };
    }
    const limit =
      error instanceof PayPalError && issueOf(error) === "WEBHOOK_NUMBER_LIMIT_EXCEEDED";
    log.warn("paypal.webhook_failed", { error });
    return {
      status: "failed",
      id: null,
      url,
      note: limit
        ? "This PayPal app already has the most webhooks PayPal allows (10). Remove one in the developer dashboard, then check the connection."
        : "PayPal didn't take the webhook, so Truce checks PayPal for changes instead. Check the connection to try again.",
    };
  }
}

/** Removes a webhook Truce registered, quietly: a missing one is already gone. */
async function removeWebhook(client: PayPal, webhook: PayPalWebhook | undefined): Promise<void> {
  if (webhook?.status !== "registered" || !webhook.id) return;
  try {
    await client.deleteWebhook(webhook.id);
  } catch (error) {
    if (!(error instanceof PayPalError && error.status === 404)) {
      log.warn("paypal.webhook_remove_failed", { error });
    }
  }
}

/** Plain notes on what the app is missing or what was skipped, for the person connecting. */
export function connectionNotes(connection: PayPalConnection): string[] {
  const notes: string[] = [];
  const { features, webhook } = connection;
  if (!features.transactions) {
    notes.push(
      "Transaction Search is off for this app, so Truce only sees orders that have disputes and can't work out your claims ratio. Turn it on under the app's features in the PayPal developer dashboard, then check the connection.",
    );
  }
  if (!features.tracking) {
    notes.push(
      "Adding tracking isn't on for this app, so Truce can't send tracking numbers to PayPal for you.",
    );
  }
  if (webhook.status !== "registered" && webhook.note) notes.push(webhook.note);
  return notes;
}

function clientFor(
  environment: PayPalEnvironment,
  clientId: string,
  clientSecret: string,
  fetchImpl?: typeof fetch,
) {
  return new PayPal({ clientId, clientSecret, base: PAYPAL_BASE[environment] }, fetchImpl);
}

/** A token for the keys, or the refusal in words the seller can act on. */
async function checkKeys(client: PayPal, environment: PayPalEnvironment) {
  try {
    return await client.tokenInfo();
  } catch (error) {
    if (error instanceof PayPalError && (error.status === 401 || error.status === 400)) {
      throw new ActionError(
        422,
        `PayPal didn't accept these keys. Check that the client ID and secret come from the same app, and that the app is a ${environment} app.`,
        { code: "paypal_rejected_keys" },
      );
    }
    log.warn("paypal.unreachable", { error });
    throw new ActionError(502, "Couldn't reach PayPal to check the keys. Try again in a moment.");
  }
}

export interface ConnectInput {
  store: Store;
  shop: Shop;
  request: ConnectPayPalRequest;
  fetchImpl?: typeof fetch;
  siteUrl?: string | null;
  now?: Date;
}

/** Connects (or reconnects) a real shop's PayPal app. Refuses keys without dispute access. */
export async function connectPayPal(input: ConnectInput): Promise<ConnectPayPalResponse> {
  const { store, request } = input;
  const now = input.now ?? new Date();
  const shop = input.shop;
  if (shop.kind !== "real") {
    throw new ActionError(
      409,
      "The sample shop's PayPal is simulated, so there's nothing to connect.",
    );
  }
  if (!encryptionReady()) {
    throw new ActionError(
      503,
      "This server can't store PayPal keys safely yet, so nothing was saved.",
      {
        code: "encryption_unavailable",
      },
    );
  }
  const clientId = request.clientId.trim();
  const client = clientFor(
    request.environment,
    clientId,
    request.clientSecret.trim(),
    input.fetchImpl,
  );
  const token = await checkKeys(client, request.environment);
  const features = featuresFromScopes(token.scopes);
  if (!features.disputes || !features.respond) {
    throw new ActionError(
      422,
      "This PayPal app can't manage disputes yet. In the PayPal developer dashboard, open the app, turn on Disputes under its features, save, and connect again.",
      { code: "paypal_missing_features" },
    );
  }

  const hash = clientIdHash(clientId);
  const previous = shop.paypal;
  if (previous && previous.clientIdHash !== hash) {
    // A different app: take Truce's webhook off the old one before forgetting its keys.
    const old = await paypalFor(store, shop, input.fetchImpl).catch(() => null);
    if (old) await removeWebhook(old.client, previous.webhook);
  }
  await store.saveSecret(
    shop.id,
    "paypal",
    sealSecret(request.clientSecret.trim(), secretContext(shop.id, hash), now),
  );
  forgetClient(shop.id);

  const target = webhookTarget(shop.id, input.siteUrl);
  const webhook: PayPalWebhook = !features.webhooks
    ? {
        status: "skipped",
        id: null,
        url: null,
        note: "This app can't register webhooks, so Truce checks PayPal for changes instead.",
      }
    : "skip" in target
      ? { status: "skipped", id: null, url: null, note: target.skip }
      : previous?.clientIdHash === hash &&
          previous.webhook.status === "registered" &&
          previous.webhook.url === target.url
        ? previous.webhook
        : await registerWebhook(client, target.url);

  const connection: PayPalConnection = {
    environment: request.environment,
    clientId,
    clientIdHash: hash,
    appId: token.appId,
    features,
    webhook,
    connectedAt: previous?.clientIdHash === hash ? previous.connectedAt : now.toISOString(),
    checkedAt: now.toISOString(),
    health: "ok",
    problem: null,
  };
  const updated: Shop = {
    ...shop,
    paypal: connection,
    orderHistory: features.transactions ? "full" : "disputes",
    updatedAt: now.toISOString(),
  };
  await store.saveShop(updated);
  log.info("paypal.connected", {
    shopId: shop.id,
    environment: request.environment,
    appId: token.appId,
    features,
    webhook: webhook.status,
  });
  const notes = connectionNotes(connection);
  // Only the shops this account can see are named; another account's shop never is.
  const twins = (await store.listShopsByPayPalApp(hash).catch(() => [])).filter(
    (s) => s.id !== shop.id && s.memberIds.some((uid) => shop.memberIds.includes(uid)),
  );
  if (twins.length) {
    notes.push(
      `This PayPal app is also connected to ${twins.map((s) => s.name).join(" and ")}. Each shop shows its disputes, and a step sent from either one reaches PayPal.`,
    );
  }
  return { shop: updated, notes };
}

/** Takes Truce's webhook off the app, forgets the keys, and keeps the shop's records. */
export async function disconnectPayPal(
  store: Store,
  shop: Shop,
  fetchImpl?: typeof fetch,
  now = new Date(),
): Promise<Shop> {
  if (!shop.paypal) return shop;
  const current = await paypalFor(store, shop, fetchImpl).catch(() => null);
  if (current) await removeWebhook(current.client, shop.paypal.webhook);
  await store.deleteSecret(shop.id, "paypal");
  forgetClient(shop.id);
  const updated: Shop = { ...shop, paypal: null, updatedAt: now.toISOString() };
  await store.saveShop(updated);
  log.info("paypal.disconnected", { shopId: shop.id });
  return updated;
}

/** Checks the keys again: features, health, and a webhook if one couldn't be registered before. */
export async function checkPayPal(
  store: Store,
  shop: Shop,
  fetchImpl?: typeof fetch,
  siteUrl?: string | null,
  now = new Date(),
): Promise<ConnectPayPalResponse> {
  const connection = shop.paypal;
  if (!connection) throw new ActionError(409, "This shop isn't connected to PayPal.");
  const current = await paypalFor(store, shop, fetchImpl);
  if (!current) {
    const broken = await markProblem(
      store,
      shop,
      "Truce can't open this shop's PayPal keys. Reconnect PayPal.",
      now,
    );
    return { shop: broken, notes: [] };
  }
  let token;
  try {
    token = await current.client.tokenInfo();
  } catch (error) {
    const problem =
      error instanceof PayPalError && (error.status === 401 || error.status === 400)
        ? "PayPal no longer accepts this app's keys. The secret may have been changed: reconnect PayPal with the new one."
        : "Couldn't reach PayPal just now.";
    const broken = await markProblem(store, shop, problem, now);
    return { shop: broken, notes: [] };
  }
  const features = featuresFromScopes(token.scopes);
  let webhook = connection.webhook;
  const target = webhookTarget(shop.id, siteUrl);
  if (webhook.status !== "registered" && features.webhooks && "url" in target) {
    webhook = await registerWebhook(current.client, target.url);
  }
  const healthy = features.disputes && features.respond;
  const updated: Shop = {
    ...shop,
    paypal: {
      ...connection,
      features,
      webhook,
      appId: token.appId ?? connection.appId,
      checkedAt: now.toISOString(),
      health: healthy ? "ok" : "error",
      problem: healthy
        ? null
        : "This app has lost its dispute access. Turn on Disputes for the app in the PayPal developer dashboard.",
    },
    orderHistory: features.transactions ? "full" : "disputes",
    updatedAt: now.toISOString(),
  };
  await store.saveShop(updated);
  return { shop: updated, notes: connectionNotes(updated.paypal!) };
}

/** Records a problem with the connection, so the app shows it and the seller can fix it. */
export async function markProblem(
  store: Store,
  shop: Shop,
  problem: string,
  now = new Date(),
): Promise<Shop> {
  if (!shop.paypal) return shop;
  const latest = (await store.getShop(shop.id)) ?? shop;
  if (!latest.paypal) return latest;
  const updated: Shop = {
    ...latest,
    paypal: { ...latest.paypal, health: "error", problem, checkedAt: now.toISOString() },
    updatedAt: now.toISOString(),
  };
  await store.saveShop(updated);
  return updated;
}

/** Clears a recorded problem once PayPal answers again. */
export async function markHealthy(store: Store, shop: Shop, now = new Date()): Promise<Shop> {
  if (!shop.paypal || shop.paypal.health === "ok") return shop;
  const latest = (await store.getShop(shop.id)) ?? shop;
  if (!latest.paypal) return latest;
  const updated: Shop = {
    ...latest,
    paypal: { ...latest.paypal, health: "ok", problem: null, checkedAt: now.toISOString() },
    updatedAt: now.toISOString(),
  };
  await store.saveShop(updated);
  return updated;
}

// ---------- The shop's clients ----------

export interface ShopPayPal {
  client: PayPal;
  extras: PayPalExtras;
}

const CLIENT_TTL_MS = 10 * 60_000;
const clients = new Map<string, { key: string; at: number; value: ShopPayPal }>();

function forgetClient(shopId: string) {
  clients.delete(shopId);
}

/**
 * The PayPal clients for a connected real shop, from its sealed keys; null for a sample shop or
 * a shop without a connection. Kept for a few minutes, so their tokens are reused.
 */
export async function paypalFor(
  store: Store,
  shop: Shop,
  fetchImpl?: typeof fetch,
  now = Date.now(),
): Promise<ShopPayPal | null> {
  const connection = shop.paypal;
  if (shop.kind !== "real" || !connection) return null;
  const sealed = await store.getSecret(shop.id, "paypal");
  if (!sealed) return null;
  const key = `${connection.clientIdHash}:${sealed.createdAt}:${connection.environment}`;
  const hit = clients.get(shop.id);
  if (!fetchImpl && hit && hit.key === key && now - hit.at < CLIENT_TTL_MS) return hit.value;
  let secret: string;
  try {
    secret = openSecret(sealed, secretContext(shop.id, connection.clientIdHash));
  } catch (error) {
    if (error instanceof SecretError) {
      log.error("paypal.secret_unreadable", { shopId: shop.id, error });
      return null;
    }
    throw error;
  }
  const config = {
    clientId: connection.clientId,
    clientSecret: secret,
    base: PAYPAL_BASE[connection.environment],
  };
  const value: ShopPayPal = {
    client: new PayPal(config, fetchImpl),
    extras: new PayPalExtras(config, fetchImpl),
  };
  if (!fetchImpl) {
    if (clients.size > 500) clients.clear();
    clients.set(shop.id, { key, at: now, value });
  }
  return value;
}
