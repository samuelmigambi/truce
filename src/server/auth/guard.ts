import "server-only";

import type { Shop, ShopRole, User } from "@/lib/domain";
import { ActionError } from "@/server/actions/errors";
import { can, isShopId, roleOf, type Capability } from "@/server/shops";
import { getStore, type Store } from "@/server/store";
import { sessionUser } from "./session";

/**
 * What every API route checks before doing anything: who's asking (the session cookie), that a
 * request that changes something came from Truce's own pages (the Origin header, so another site
 * can't post with the visitor's cookie), and, for a shop's routes, that the person is a member
 * with the right role. A shop that isn't theirs is "not found", never "forbidden", so its
 * existence isn't given away.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** The origins this server answers on: the request's own host, and SITE_URL's. */
function allowedHosts(request: Request): Set<string> {
  const hosts = new Set<string>();
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = request.headers.get("host")?.trim();
  for (const h of [forwarded, host]) if (h) hosts.add(h.toLowerCase());
  try {
    hosts.add(new URL(request.url).host.toLowerCase());
  } catch {
    // A relative URL in tests; the headers above still count.
  }
  const site = process.env.SITE_URL?.trim();
  if (site) {
    try {
      hosts.add(new URL(site).host.toLowerCase());
    } catch {
      // A malformed SITE_URL adds nothing.
    }
  }
  return hosts;
}

/**
 * Refuses a state-changing request that didn't come from Truce's own pages. Browsers send Origin
 * with every POST, PATCH and DELETE; a request without one (curl, a server) must say it came
 * from the same site through Sec-Fetch-Site, which browsers set and scripts can't fake.
 */
export function checkOrigin(request: Request): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    let host: string;
    try {
      host = new URL(origin).host.toLowerCase();
    } catch {
      throw new ActionError(403, "This request didn't come from Truce.", { code: "bad_origin" });
    }
    if (allowedHosts(request).has(host)) return;
    throw new ActionError(403, "This request didn't come from Truce.", { code: "bad_origin" });
  }
  if (request.headers.get("sec-fetch-site") === "same-origin") return;
  throw new ActionError(403, "This request didn't come from Truce.", { code: "bad_origin" });
}

/** The visitor's network address, for rate limits; Cloud Run puts it first in x-forwarded-for. */
export function clientIp(source: Headers): string {
  const forwarded = source.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || source.get("x-real-ip")?.trim() || "local";
}

/** The signed-in person, after the origin check for anything that changes data. 401 otherwise. */
export async function requireUser(request: Request): Promise<User> {
  checkOrigin(request);
  const user = await sessionUser();
  if (!user) {
    throw new ActionError(401, "Sign in to continue.", { code: "signed_out" });
  }
  return user;
}

export interface ShopAccess {
  user: User;
  shop: Shop;
  role: ShopRole;
}

const NEEDS: Record<Capability, string> = {
  read: "You can't see this shop.",
  act: "Your role in this shop can't do that.",
  manage: "Only the shop's owner or an admin can change its settings.",
  own: "Only the shop's owner can do that.",
};

/** The shop, if the person is a member who may do `need` in it; 404 for anyone else. */
export async function shopForUser(
  user: User,
  shopId: string,
  need: Capability = "read",
  store: Store = getStore(),
): Promise<ShopAccess> {
  const notFound = new ActionError(404, "There's no shop with that ID in your account.", {
    code: "shop_not_found",
  });
  if (!isShopId(shopId)) throw notFound;
  const shop = await store.getShop(shopId);
  const role = shop ? roleOf(shop, user.uid) : null;
  if (!shop || !role) throw notFound;
  if (!can(role, need)) throw new ActionError(403, NEEDS[need], { code: "not_allowed" });
  return { user, shop, role };
}

/** For a shop's routes: the person, the shop and their role, checked in that order. */
export async function requireShop(
  request: Request,
  shopId: string,
  need: Capability = "read",
): Promise<ShopAccess> {
  const user = await requireUser(request);
  return shopForUser(user, shopId, need);
}

/** For a shop's data routes: the shop must also be ready (set up and synced once). */
export async function requireReadyShop(
  request: Request,
  shopId: string,
  need: Capability = "read",
): Promise<ShopAccess> {
  const access = await requireShop(request, shopId, need);
  if (access.shop.status !== "ready") {
    throw new ActionError(409, "This shop is still being set up. Finish onboarding first.", {
      code: "shop_not_ready",
    });
  }
  return access;
}
