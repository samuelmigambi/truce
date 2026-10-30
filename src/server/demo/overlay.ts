import "server-only";

import type { ChatSummary, ChatThread } from "@/lib/chat-thread";
import type { Analysis, AppNotification, Case, CaseEvent, Order, Shop, User } from "@/lib/domain";
import {
  versionOf,
  type BulkStore,
  type SeedOnRead,
  type ShopData,
  type Versioned,
} from "@/server/store/bulk";
import { sortEvents } from "@/server/store/memory";
import type { SealedSecret, SecretName, Store } from "@/server/store/types";
import { isCurrentSeed, seedOf, type DemoSeed } from "./seed";

/**
 * Sample shops on Firestore, without writing the seed. The seed is the same for every sample
 * shop seeded on a given day, so it's worked out in memory from that day; Firestore keeps only
 * what changed since: replies, refunds, new scans, approvals, analyses. A stored record replaces
 * the seeded one with the same ID. A new sample shop is then one small write instead of about
 * 600 KB, and reads fetch a handful of records instead of every order.
 */
export class SeededStore implements Store, BulkStore, Versioned, SeedOnRead {
  readonly kind: Store["kind"];
  readonly seedsOnRead = true as const;

  constructor(private readonly inner: Store & BulkStore) {
    this.kind = inner.kind;
  }

  /** The seed behind a sample shop; null for a real shop or one seeded by an older seed. */
  private async base(shopId: string): Promise<DemoSeed | null> {
    const shop = await this.inner.getShop(shopId);
    if (!shop || shop.kind !== "sample" || !isCurrentSeed(shop.seedVersion)) return null;
    return seedOf(shop.seededAt ?? shop.createdAt);
  }

  version(shopId: string): number {
    return versionOf(this.inner, shopId) ?? 0;
  }

  getUser(uid: string): Promise<User | null> {
    return this.inner.getUser(uid);
  }

  saveUser(user: User): Promise<void> {
    return this.inner.saveUser(user);
  }

  getShop(id: string): Promise<Shop | null> {
    return this.inner.getShop(id);
  }

  saveShop(shop: Shop): Promise<void> {
    return this.inner.saveShop(shop);
  }

  listShopsFor(uid: string): Promise<Shop[]> {
    return this.inner.listShopsFor(uid);
  }

  listConnectedShops(): Promise<Shop[]> {
    return this.inner.listConnectedShops();
  }

  listShopsByPayPalApp(clientIdHash: string): Promise<Shop[]> {
    return this.inner.listShopsByPayPalApp(clientIdHash);
  }

  deleteShop(id: string): Promise<void> {
    return this.inner.deleteShop(id);
  }

  /** Removes what was stored; the seed itself stays, as it's never stored. */
  clearShop(id: string): Promise<void> {
    return this.inner.clearShop(id);
  }

  getSecret(shopId: string, name: SecretName): Promise<SealedSecret | null> {
    return this.inner.getSecret(shopId, name);
  }

  saveSecret(shopId: string, name: SecretName, secret: SealedSecret): Promise<void> {
    return this.inner.saveSecret(shopId, name, secret);
  }

  deleteSecret(shopId: string, name: SecretName): Promise<void> {
    return this.inner.deleteSecret(shopId, name);
  }

  async listOrders(shopId: string): Promise<Order[]> {
    const [base, stored] = await Promise.all([this.base(shopId), this.inner.listOrders(shopId)]);
    return merge(base?.orders, stored);
  }

  async getOrder(shopId: string, orderId: string): Promise<Order | null> {
    const [base, stored] = await Promise.all([
      this.base(shopId),
      this.inner.getOrder(shopId, orderId),
    ]);
    return stored ?? seeded(base?.orders.find((o) => o.id === orderId));
  }

  saveOrder(shopId: string, order: Order): Promise<void> {
    return this.inner.saveOrder(shopId, order);
  }

  async listCases(shopId: string): Promise<Case[]> {
    const [base, stored] = await Promise.all([this.base(shopId), this.inner.listCases(shopId)]);
    return merge(base?.cases, stored);
  }

  async getCase(shopId: string, caseId: string): Promise<Case | null> {
    const [base, stored] = await Promise.all([
      this.base(shopId),
      this.inner.getCase(shopId, caseId),
    ]);
    return stored ?? seeded(base?.cases.find((c) => c.id === caseId));
  }

  saveCase(shopId: string, kase: Case): Promise<void> {
    return this.inner.saveCase(shopId, kase);
  }

  async listEvents(shopId: string, caseId: string): Promise<CaseEvent[]> {
    const [base, stored] = await Promise.all([
      this.base(shopId),
      this.inner.listEvents(shopId, caseId),
    ]);
    return sortEvents(merge(base?.events[caseId], stored));
  }

  addEvent(shopId: string, caseId: string, event: CaseEvent): Promise<void> {
    return this.inner.addEvent(shopId, caseId, event);
  }

  getAnalysis(shopId: string, caseId: string): Promise<Analysis | null> {
    return this.inner.getAnalysis(shopId, caseId);
  }

  saveAnalysis(shopId: string, analysis: Analysis): Promise<void> {
    return this.inner.saveAnalysis(shopId, analysis);
  }

  listAnalyses(shopId: string): Promise<Analysis[]> {
    return this.inner.listAnalyses(shopId);
  }

  listNotifications(shopId: string, limit: number): Promise<AppNotification[]> {
    return this.inner.listNotifications(shopId, limit);
  }

  saveNotification(shopId: string, notification: AppNotification): Promise<void> {
    return this.inner.saveNotification(shopId, notification);
  }

  // Chats aren't part of the seed: they go straight to the inner store.
  listChats(shopId: string, uid: string, limit: number): Promise<ChatSummary[]> {
    return this.inner.listChats(shopId, uid, limit);
  }

  getChat(shopId: string, uid: string, chatId: string): Promise<ChatThread | null> {
    return this.inner.getChat(shopId, uid, chatId);
  }

  saveChat(shopId: string, chat: ChatThread): Promise<void> {
    return this.inner.saveChat(shopId, chat);
  }

  deleteChat(shopId: string, uid: string, chatId: string): Promise<void> {
    return this.inner.deleteChat(shopId, uid, chatId);
  }

  clearChats(shopId: string): Promise<void> {
    return this.inner.clearChats(shopId);
  }

  replaceShop(data: ShopData, fresh: boolean): Promise<void> {
    return this.inner.replaceShop(data, fresh);
  }

  getCached<T>(key: string): Promise<T | null> {
    return this.inner.getCached<T>(key);
  }

  setCached<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    return this.inner.setCached(key, value, ttlSeconds);
  }

  increment(key: string, by: number, windowSeconds: number): Promise<number> {
    return this.inner.increment(key, by, windowSeconds);
  }
}

/** A copy of a seeded record, so the shared seed is never changed by a caller. */
function seeded<T>(record: T | undefined): T | null {
  return record === undefined ? null : structuredClone(record);
}

/** The seeded records with stored ones in their place, then any stored records the seed lacks. */
function merge<T extends { id: string }>(base: readonly T[] | undefined, stored: T[]): T[] {
  if (!base?.length) return stored;
  const replaced = new Map(stored.map((record) => [record.id, record]));
  const merged = base.map((record) => replaced.get(record.id) ?? structuredClone(record));
  const seededIds = new Set(base.map((record) => record.id));
  for (const record of stored) if (!seededIds.has(record.id)) merged.push(record);
  return merged;
}
