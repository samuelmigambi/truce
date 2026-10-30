import "server-only";

import type {
  CreateShopRequest,
  MeResponse,
  ShopResponse,
  UpdateShopRequest,
} from "@/lib/api-types";
import type { Shop, User } from "@/lib/domain";
import { ActionError } from "@/server/actions/errors";
import type { ShopAccess } from "@/server/auth/guard";
import { createSampleShop, resetSampleShop } from "@/server/demo/sample";
import { rateLimit } from "@/server/limits";
import { log } from "@/server/log";
import { disconnectPayPal } from "@/server/paypal/connection";
import { advanceTo, can, newRealShop, shopSummary, sortShops } from "@/server/shops";
import type { Store } from "@/server/store";

/**
 * A shop's life: made during onboarding (a real one from its details, or the sample shop),
 * changed in onboarding and settings, started over (the sample shop), and deleted by its owner.
 */

const MAX_SHOPS = 20;
const MAX_SAMPLE_SHOPS = 3;

/** The account and its shops, for the switcher and onboarding. */
export async function meResponse(store: Store, user: User): Promise<MeResponse> {
  const shops = await store.listShopsFor(user.uid);
  return { user, shops: sortShops(shops.map((s) => shopSummary(s, user.uid))) };
}

/** Saves the person's name, and shows it on every shop they're in. */
export async function updateName(
  store: Store,
  user: User,
  name: string,
  now = new Date(),
): Promise<User> {
  const updated: User = {
    ...user,
    name,
    updatedAt: now.toISOString(),
  };
  await store.saveUser(updated);
  // Their name shows on the shops they're in.
  for (const shop of await store.listShopsFor(user.uid)) {
    const member = shop.members[user.uid];
    if (member && member.name !== name) {
      await store.saveShop({
        ...shop,
        members: { ...shop.members, [user.uid]: { ...member, name } },
      });
    }
  }
  return updated;
}

export async function createShop(
  store: Store,
  user: User,
  request: CreateShopRequest,
  now = new Date(),
): Promise<ShopResponse> {
  if (!(await rateLimit(`new-shop:${user.uid}`, 12, 24 * 60 * 60, store))) {
    throw new ActionError(429, "That's a lot of new shops for one day. Try again tomorrow.");
  }
  const shops = await store.listShopsFor(user.uid);
  if (shops.length >= MAX_SHOPS) {
    throw new ActionError(
      409,
      `An account can have up to ${MAX_SHOPS} shops. Delete one to add another.`,
    );
  }

  let shop: Shop;
  if (request.kind === "sample") {
    if (shops.filter((s) => s.kind === "sample").length >= MAX_SAMPLE_SHOPS) {
      throw new ActionError(
        409,
        "You already have the sample shop. Open it from the shop switcher.",
      );
    }
    shop = await createSampleShop(store, user, now);
  } else {
    // A second tap, or a reload before the answer: carry on with the shop already being made.
    const draft = shops.find(
      (s) => s.id === user.onboarding.shopId && s.kind === "real" && s.status === "setup",
    );
    shop = draft
      ? { ...draft, ...request.profile, updatedAt: now.toISOString() }
      : newRealShop(user, request.profile, now);
    await store.saveShop(shop);
  }
  await store.saveUser({
    ...user,
    onboarding: { ...user.onboarding, shopId: shop.id },
    updatedAt: now.toISOString(),
  });
  log.info("shops.created", { shopId: shop.id, kind: shop.kind, uid: user.uid });
  return { shop, role: "owner" };
}

export async function updateShop(
  store: Store,
  access: ShopAccess,
  request: UpdateShopRequest,
  now = new Date(),
): Promise<ShopResponse> {
  const { user, role } = access;
  let shop = access.shop;
  const manage =
    request.profile !== undefined ||
    request.policies !== undefined ||
    request.setupStep !== undefined;
  if (manage && !can(role, "manage")) {
    throw new ActionError(403, "Only the shop's owner or an admin can change its settings.", {
      code: "not_allowed",
    });
  }
  if (request.profile) shop = { ...shop, ...request.profile };
  if (request.policies) {
    if (shop.kind === "sample") {
      throw new ActionError(409, "The sample shop's policies are part of its sample data.");
    }
    shop = { ...shop, policies: request.policies };
  }
  if (request.notifications) {
    const member = shop.members[user.uid];
    if (!member) throw new ActionError(404, "There's no shop with that ID in your account.");
    shop = {
      ...shop,
      members: { ...shop.members, [user.uid]: { ...member, notifications: request.notifications } },
    };
  }
  if (request.setupStep) {
    if (shop.status === "setup") shop = advanceTo(shop, request.setupStep);
  }
  shop = { ...shop, updatedAt: now.toISOString() };
  await store.saveShop(shop);
  return { shop, role };
}

/** Deletes a shop for good: its webhook on PayPal, its keys, and every record in it. */
export async function deleteShop(
  store: Store,
  access: ShopAccess,
  now = new Date(),
): Promise<void> {
  const { shop, user } = access;
  if (!can(access.role, "own")) {
    throw new ActionError(403, "Only the shop's owner can delete it.", { code: "not_allowed" });
  }
  if (shop.paypal)
    await disconnectPayPal(store, shop, undefined, now).catch((error) => {
      log.warn("shops.delete_disconnect_failed", { shopId: shop.id, error });
    });
  await store.deleteShop(shop.id);
  const person = (await store.getUser(user.uid)) ?? user;
  await store.saveUser({
    ...person,
    lastShopId: person.lastShopId === shop.id ? null : person.lastShopId,
    onboarding: {
      ...person.onboarding,
      shopId: person.onboarding.shopId === shop.id ? null : person.onboarding.shopId,
    },
    updatedAt: now.toISOString(),
  });
  log.info("shops.deleted", { shopId: shop.id, kind: shop.kind, uid: user.uid });
}

/** Starts the sample shop over, from fresh sample data. */
export async function resetSample(
  store: Store,
  access: ShopAccess,
  now = new Date(),
): Promise<ShopResponse> {
  if (access.shop.kind !== "sample") {
    throw new ActionError(
      409,
      "Only the sample shop can be started over. A real shop's data comes from PayPal.",
    );
  }
  if (!can(access.role, "manage")) {
    throw new ActionError(403, "Only the shop's owner or an admin can start it over.", {
      code: "not_allowed",
    });
  }
  const shop = await resetSampleShop(store, access.shop, now);
  // Starting over clears the conversations too: they talk about cases that are back to the start.
  await store.clearChats(shop.id);
  return { shop, role: access.role };
}
