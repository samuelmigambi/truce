import "server-only";

import { summaryOf, type ChatSummary, type ChatThread } from "@/lib/chat-thread";
import type { Analysis, AppNotification, Case, CaseEvent, Order, Shop, User } from "@/lib/domain";
import type { BulkStore, ShopData, Versioned } from "./bulk";
import type { SealedSecret, SecretName, Store } from "./types";

/** One shop's records, keyed by ID. */
interface Bucket {
  orders: Map<string, Order>;
  cases: Map<string, Case>;
  /** Case ID to its events, keyed by event ID. */
  events: Map<string, Map<string, CaseEvent>>;
  analyses: Map<string, Analysis>;
  notifications: Map<string, AppNotification>;
  /** Keyed by `${uid}/${chatId}`. */
  chats: Map<string, ChatThread>;
}

/**
 * The store for tests and for running without Google credentials. Records are copied in and out,
 * so a caller holding an object can't change what's stored by accident.
 */
export class MemoryStore implements Store, BulkStore, Versioned {
  readonly kind = "memory" as const;
  private users = new Map<string, User>();
  private shops = new Map<string, Shop>();
  private secrets = new Map<string, SealedSecret>();
  private buckets = new Map<string, Bucket>();
  private cache = new Map<string, { value: unknown; expiresAt: number | null }>();
  private counters = new Map<string, { window: number; total: number }>();
  private versions = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Empties everything; for tests. */
  reset(): void {
    this.users.clear();
    this.shops.clear();
    this.secrets.clear();
    this.buckets.clear();
    this.cache.clear();
    this.counters.clear();
    this.versions.clear();
  }

  version(shopId: string): number {
    return this.versions.get(shopId) ?? 0;
  }

  private touch(shopId: string): void {
    this.versions.set(shopId, this.version(shopId) + 1);
  }

  private bucket(shopId: string): Bucket {
    let bucket = this.buckets.get(shopId);
    if (!bucket) {
      bucket = {
        orders: new Map(),
        cases: new Map(),
        events: new Map(),
        analyses: new Map(),
        notifications: new Map(),
        chats: new Map(),
      };
      this.buckets.set(shopId, bucket);
    }
    return bucket;
  }

  async getUser(uid: string): Promise<User | null> {
    return copyOrNull(this.users.get(uid));
  }

  async saveUser(user: User): Promise<void> {
    this.users.set(user.uid, copy(user));
  }

  async getShop(id: string): Promise<Shop | null> {
    return copyOrNull(this.shops.get(id));
  }

  async saveShop(shop: Shop): Promise<void> {
    this.shops.set(shop.id, copy(shop));
    this.touch(shop.id);
  }

  async listShopsFor(uid: string): Promise<Shop[]> {
    return [...this.shops.values()].filter((s) => s.memberIds.includes(uid)).map(copy);
  }

  async listConnectedShops(): Promise<Shop[]> {
    return [...this.shops.values()].filter((s) => s.kind === "real" && s.paypal).map(copy);
  }

  async listShopsByPayPalApp(clientIdHash: string): Promise<Shop[]> {
    return [...this.shops.values()]
      .filter((s) => s.kind === "real" && s.paypal?.clientIdHash === clientIdHash)
      .map(copy);
  }

  async deleteShop(id: string): Promise<void> {
    this.shops.delete(id);
    this.buckets.delete(id);
    for (const key of [...this.secrets.keys()])
      if (key.startsWith(`${id}/`)) this.secrets.delete(key);
    this.touch(id);
  }

  async clearShop(id: string): Promise<void> {
    // Chats aren't the shop's records; clearChats removes them.
    const chats = this.buckets.get(id)?.chats;
    this.buckets.delete(id);
    if (chats?.size) this.bucket(id).chats = chats;
    this.touch(id);
  }

  async getSecret(shopId: string, name: SecretName): Promise<SealedSecret | null> {
    return copyOrNull(this.secrets.get(`${shopId}/${name}`));
  }

  async saveSecret(shopId: string, name: SecretName, secret: SealedSecret): Promise<void> {
    this.secrets.set(`${shopId}/${name}`, copy(secret));
  }

  async deleteSecret(shopId: string, name: SecretName): Promise<void> {
    this.secrets.delete(`${shopId}/${name}`);
  }

  async listOrders(shopId: string): Promise<Order[]> {
    return [...this.bucket(shopId).orders.values()].map(copy);
  }

  async getOrder(shopId: string, orderId: string): Promise<Order | null> {
    return copyOrNull(this.bucket(shopId).orders.get(orderId));
  }

  async saveOrder(shopId: string, order: Order): Promise<void> {
    this.bucket(shopId).orders.set(order.id, copy(order));
    this.touch(shopId);
  }

  async listCases(shopId: string): Promise<Case[]> {
    return [...this.bucket(shopId).cases.values()].map(copy);
  }

  async getCase(shopId: string, caseId: string): Promise<Case | null> {
    return copyOrNull(this.bucket(shopId).cases.get(caseId));
  }

  async saveCase(shopId: string, kase: Case): Promise<void> {
    this.bucket(shopId).cases.set(kase.id, copy(kase));
    this.touch(shopId);
  }

  async listEvents(shopId: string, caseId: string): Promise<CaseEvent[]> {
    const events = this.bucket(shopId).events.get(caseId);
    return sortEvents([...(events?.values() ?? [])].map(copy));
  }

  /** Saving an event with an ID that's already there replaces it, as Firestore does. */
  async addEvent(shopId: string, caseId: string, event: CaseEvent): Promise<void> {
    const all = this.bucket(shopId).events;
    let events = all.get(caseId);
    if (!events) {
      events = new Map();
      all.set(caseId, events);
    }
    events.set(event.id, copy(event));
    this.touch(shopId);
  }

  async getAnalysis(shopId: string, caseId: string): Promise<Analysis | null> {
    return copyOrNull(this.bucket(shopId).analyses.get(caseId));
  }

  async saveAnalysis(shopId: string, analysis: Analysis): Promise<void> {
    this.bucket(shopId).analyses.set(analysis.caseId, copy(analysis));
    this.touch(shopId);
  }

  async listAnalyses(shopId: string): Promise<Analysis[]> {
    return [...this.bucket(shopId).analyses.values()].map(copy);
  }

  async listNotifications(shopId: string, limit: number): Promise<AppNotification[]> {
    return [...this.bucket(shopId).notifications.values()]
      .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
      .slice(0, limit)
      .map(copy);
  }

  async saveNotification(shopId: string, notification: AppNotification): Promise<void> {
    this.bucket(shopId).notifications.set(notification.id, copy(notification));
    this.touch(shopId);
  }

  async listChats(shopId: string, uid: string, limit: number): Promise<ChatSummary[]> {
    return [...this.bucket(shopId).chats.values()]
      .filter((c) => c.uid === uid)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
      .slice(0, limit)
      .map(summaryOf);
  }

  async getChat(shopId: string, uid: string, chatId: string): Promise<ChatThread | null> {
    return copyOrNull(this.bucket(shopId).chats.get(`${uid}/${chatId}`));
  }

  async saveChat(shopId: string, chat: ChatThread): Promise<void> {
    this.bucket(shopId).chats.set(`${chat.uid}/${chat.id}`, copy(chat));
  }

  async deleteChat(shopId: string, uid: string, chatId: string): Promise<void> {
    this.bucket(shopId).chats.delete(`${uid}/${chatId}`);
  }

  async clearChats(shopId: string): Promise<void> {
    this.bucket(shopId).chats.clear();
  }

  async replaceShop(data: ShopData): Promise<void> {
    const id = data.shop.id;
    const notifications = this.buckets.get(id)?.notifications ?? new Map();
    const chats = this.buckets.get(id)?.chats ?? new Map();
    const bucket: Bucket = {
      orders: new Map(data.orders.map((o) => [o.id, copy(o)])),
      cases: new Map(data.cases.map((c) => [c.id, copy(c)])),
      events: new Map(
        Object.entries(data.events).map(([caseId, list]) => [
          caseId,
          new Map(list.map((e) => [e.id, copy(e)])),
        ]),
      ),
      analyses: new Map(),
      notifications: data.keepNotifications ? notifications : new Map(),
      chats,
    };
    this.buckets.set(id, bucket);
    for (const entry of data.cache ?? [])
      await this.setCached(entry.key, entry.value, entry.ttlSeconds);
    this.shops.set(id, copy(data.shop));
    this.touch(id);
  }

  async getCached<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.cache.delete(key);
      return null;
    }
    return copy(entry.value) as T;
  }

  async setCached<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? this.now() + ttlSeconds * 1000 : null;
    this.cache.set(key, { value: copy(value), expiresAt });
  }

  async increment(key: string, by: number, windowSeconds: number): Promise<number> {
    const window = windowOf(this.now(), windowSeconds);
    const entry = this.counters.get(key);
    const total = (entry && entry.window === window ? entry.total : 0) + by;
    this.counters.set(key, { window, total });
    return total;
  }
}

/** Which fixed window a moment falls in; a daily window starts at midnight UTC. */
export function windowOf(at: number, windowSeconds: number): number {
  return Math.floor(at / (Math.max(1, windowSeconds) * 1000));
}

/** Events oldest first; ties keep a stable order by ID. */
export function sortEvents(events: CaseEvent[]): CaseEvent[] {
  return events.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function copyOrNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : copy(value);
}

const shared = globalThis as unknown as { __truceMemoryStore?: MemoryStore };

/** One memory store per process, kept on globalThis so it survives hot reloads in development. */
export function memoryStore(): MemoryStore {
  shared.__truceMemoryStore ??= new MemoryStore();
  return shared.__truceMemoryStore;
}
