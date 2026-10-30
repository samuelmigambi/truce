import type { PayPalConnection, Shop, User } from "@/lib/domain";
import { DEFAULT_NOTIFICATIONS } from "@/lib/shop-options";
import { sampleShop } from "@/server/demo/sample";
import { seedSample } from "@/server/demo/seed";
import type { Store } from "@/server/store/types";

/** Accounts and shops for tests, built the same way the app builds them. */

export function testUser(uid = "user-1", overrides: Partial<User> = {}): User {
  return {
    uid,
    email: `${uid}@example.test`,
    emailVerified: true,
    name: "Robin Seller",
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
    lastShopId: null,
    onboarding: { shopId: null },
    sessionsValidAfter: null,
    ...overrides,
  };
}

export function testConnection(overrides: Partial<PayPalConnection> = {}): PayPalConnection {
  return {
    environment: "sandbox",
    clientId: "AYtestclientid0000000000000000000000000000000000000000000000000000000000000001",
    clientIdHash: "hash-1",
    appId: "APP-TEST",
    features: {
      disputes: true,
      respond: true,
      transactions: false,
      tracking: true,
      webhooks: true,
    },
    webhook: { status: "skipped", id: null, url: null, note: "Local development" },
    connectedAt: "2026-10-27T09:00:00.000Z",
    checkedAt: "2026-10-27T09:00:00.000Z",
    health: "ok",
    problem: null,
    ...overrides,
  };
}

/** A ready real shop owned by `owner`, connected to a sandbox app unless `paypal` says otherwise. */
export function testRealShop(owner: User = testUser(), overrides: Partial<Shop> = {}): Shop {
  return {
    id: "sh_realshop00000001",
    kind: "real",
    name: "Hearth & Field",
    website: "https://hearthandfield.example.com",
    currency: "USD",
    timeZone: "America/Chicago",
    sells: "Hand-thrown ceramics",
    status: "ready",
    setupStep: "review",
    policies: {
      shipping: { text: "Orders ship in 2 days with tracking.", url: null },
      returns: { text: "Returns within 30 days.", url: null },
    },
    ownerUid: owner.uid,
    members: {
      [owner.uid]: {
        uid: owner.uid,
        role: "owner",
        email: owner.email,
        name: owner.name,
        joinedAt: "2026-10-01T09:00:00.000Z",
        notifications: { ...DEFAULT_NOTIFICATIONS },
      },
    },
    memberIds: [owner.uid],
    paypal: testConnection(),
    orderHistory: "disputes",
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
    readyAt: "2026-10-01T09:05:00.000Z",
    lastSyncAt: null,
    lastSweepAt: null,
    seedVersion: null,
    seededAt: null,
    ...overrides,
  };
}

/** A sample shop seeded at `at`, ready, saved in `store`. */
export async function testSampleShop(
  store: Store,
  at: string,
  owner: User = testUser(),
  id = "sh_sampleshop000001",
): Promise<Shop> {
  const base = {
    ...sampleShop(owner, new Date(at), null, id),
    status: "ready" as const,
    setupStep: "review" as const,
  };
  return seedSample(store, base, { fresh: true, now: new Date(at) });
}
