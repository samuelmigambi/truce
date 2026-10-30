import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { ShopSummary } from "@/lib/api-types";
import type { Shop, ShopRole, User } from "@/lib/domain";
import { log } from "@/server/log";
import { landingPath, roleOf, shopSummary, sortShops } from "@/server/shops";
import { getStore } from "@/server/store";
import { sessionUser } from "./session";

/**
 * The checks server pages and layouts make. The proxy only looks for the cookie; these verify
 * it, and send people where they belong: signed out to sign-in, a shop that isn't ready to
 * onboarding, a shop that isn't theirs to a 404. Each is memoized for one render.
 */

/** The signed-in person, or null. */
export const pageUser = cache(async (): Promise<User | null> => sessionUser());

/** The signed-in person; anyone else goes to sign-in, then back to `next`. */
export async function requirePageUser(next: string): Promise<User> {
  const user = await pageUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(next)}`);
  return user;
}

const shopsOf = cache(async (uid: string): Promise<Shop[]> => getStore().listShopsFor(uid));

/** The person's shops for the switcher: ready ones first. */
export async function pageShops(user: User): Promise<ShopSummary[]> {
  return sortShops((await shopsOf(user.uid)).map((s) => shopSummary(s, user.uid)));
}

/** Where a signed-in person belongs: their last ready shop, or onboarding. */
export function landingFor(user: User, shops: ShopSummary[]): string {
  return landingPath(user, shops);
}

/**
 * The shop a page is about, for a member. Anyone else gets a 404; a shop still in setup goes
 * back to onboarding, since only a ready shop reaches the app.
 */
export async function requirePageShop(
  user: User,
  shopId: string,
): Promise<{ shop: Shop; role: ShopRole; shops: ShopSummary[] }> {
  const shops = await shopsOf(user.uid);
  const shop = shops.find((s) => s.id === shopId);
  const role = shop ? roleOf(shop, user.uid) : null;
  if (!shop || !role) notFound();
  if (shop.status !== "ready") redirect(`/onboarding?shop=${encodeURIComponent(shop.id)}`);
  if (user.lastShopId !== shop.id) {
    // The app opens here next time. Losing this write only means opening another shop.
    void getStore()
      .saveUser({ ...user, lastShopId: shop.id, updatedAt: new Date().toISOString() })
      .catch((error: unknown) => log.warn("pages.last_shop_failed", { uid: user.uid, error }));
  }
  return { shop, role, shops: sortShops(shops.map((s) => shopSummary(s, user.uid))) };
}

/**
 * Where onboarding starts: the shop named by `shopId` if it's theirs and still in setup,
 * otherwise the one shop the person was setting up, if any.
 */
export async function onboardingState(
  user: User,
  options: { shopId?: string } = {},
): Promise<{ user: User; shop: Shop | null; shops: ShopSummary[] }> {
  const all = await shopsOf(user.uid);
  const inSetup = (id: string | null | undefined) =>
    all.find((s) => s.id === id && s.status === "setup" && roleOf(s, user.uid)) ?? null;
  const shop = inSetup(options.shopId) ?? inSetup(user.onboarding.shopId);
  return { user, shop, shops: sortShops(all.map((s) => shopSummary(s, user.uid))) };
}
