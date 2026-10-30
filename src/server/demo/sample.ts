import "server-only";

import { POLICIES } from "@/lib/catalog";
import { sampleProfile } from "@/lib/shop-options";
import type { Shop, User } from "@/lib/domain";
import { newShopId, ownerMember } from "@/server/shops";
import type { Store } from "@/server/store";
import { seedSample } from "./seed";

/**
 * The sample shop: Wick & Ember's data in a normal shop of the person's own, for exploring Truce
 * without a PayPal app. Its PayPal calls and carrier scans are simulated, and the app says so
 * wherever they show. Its storefront is the demo storefront at /shop.
 */

/** The demo storefront's address on this server, when there is one. */
function storefront(siteUrl: string | null): { site: string | null; policies: string | null } {
  if (!siteUrl) return { site: null, policies: null };
  try {
    const origin = new URL(siteUrl).origin;
    return { site: `${origin}/shop`, policies: `${origin}/shop/policies` };
  } catch {
    return { site: null, policies: null };
  }
}

/** A new sample shop for `user`, at the notifications step: its details, PayPal and policies come with it. */
export function sampleShop(
  user: User,
  now: Date,
  siteUrl: string | null = process.env.SITE_URL?.trim() || null,
  id = newShopId(),
): Shop {
  const at = now.toISOString();
  const { site, policies } = storefront(siteUrl);
  return {
    id,
    kind: "sample",
    ...sampleProfile(site),
    status: "setup",
    setupStep: "notifications",
    policies: {
      shipping: { text: POLICIES.shipping.join("\n"), url: policies },
      returns: { text: POLICIES.returns.join("\n"), url: policies },
    },
    ownerUid: user.uid,
    members: { [user.uid]: ownerMember(user, now) },
    memberIds: [user.uid],
    paypal: null,
    orderHistory: "full",
    createdAt: at,
    updatedAt: at,
    readyAt: null,
    lastSyncAt: null,
    lastSweepAt: null,
    seedVersion: null,
    seededAt: null,
  };
}

/** Makes and seeds a sample shop. */
export async function createSampleShop(store: Store, user: User, now = new Date()): Promise<Shop> {
  return seedSample(store, sampleShop(user, now), { fresh: true, now });
}

/** Starts a sample shop over: fresh sample data dated from now, every change and analysis gone. */
export async function resetSampleShop(store: Store, shop: Shop, now = new Date()): Promise<Shop> {
  return seedSample(store, { ...shop, lastSweepAt: null }, { now });
}
