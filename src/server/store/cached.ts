import "server-only";

import type { ChatSummary, ChatThread } from "@/lib/chat-thread";
import type { Analysis, AppNotification, Case, CaseEvent, Order, Shop, User } from "@/lib/domain";
import { isBulk, type BulkStore, type ShopData, type Versioned } from "./bulk";
import type { SealedSecret, SecretName, Store } from "./types";

/**
 * A short-lived read cache in front of Firestore, inside this server process. A page asks for
 * cases, orders and metrics at once; each shop's records are fetched once and shared, and reads
 * that arrive while a fetch is in flight wait for it instead of starting another. Any write
 * through this store drops that shop's cached reads, so this process never serves stale data;
 * another server instance may, for at most the few seconds a read is kept. Accounts are kept
 * only briefly, so "sign out everywhere" reaches every instance within seconds; secrets and the
 * shop lists behind queries are never cached.
 */

const DEFAULT_TTL_MS = 4_000;
/** Every request reads its shop and its account first. */
const SHOP_TTL_MS = 10_000;
const USER_TTL_MS = 3_000;
/** Past this many entries, expired ones are swept out, so memory stays bounded by recent traffic. */
const SWEEP_AT = 200;

interface Entry {
  at: number;
  value: Promise<unknown>;
}

export class CachedStore implements Store, BulkStore, Versioned {
  readonly kind: Store["kind"];
  private entries = new Map<string, Entry>();
  private versions = new Map<string, number>();

  constructor(
    private readonly inner: Store,
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {
    this.kind = inner.kind;
  }

  version(shopId: string): number {
    return this.versions.get(shopId) ?? 0;
  }

  private ttlFor(key: string): number {
    if (key.endsWith("|shop")) return Math.max(this.ttlMs, SHOP_TTL_MS);
    if (key.startsWith("user|")) return Math.min(this.ttlMs, USER_TTL_MS);
    return this.ttlMs;
  }

  /** The cached value for a key, or a fresh read that later callers share. Callers get copies. */
  private read<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && this.now() - hit.at < this.ttlFor(key)) return hit.value.then(copy) as Promise<T>;
    if (this.entries.size > SWEEP_AT) this.sweep();
    const value = load();
    const entry = { at: this.now(), value };
    this.entries.set(key, entry);
    value.catch(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    return value.then(copy);
  }

  private sweep(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (now - entry.at >= this.ttlFor(key)) this.entries.delete(key);
    }
  }

  /** A fresh cached list, without fetching one. */
  private peek<T>(key: string): Promise<T> | null {
    const hit = this.entries.get(key);
    return hit && this.now() - hit.at < this.ttlMs ? (hit.value as Promise<T>) : null;
  }

  /** Drops a shop's cached reads, before a write and again after it lands. */
  private forget(shopId: string): void {
    const prefix = `${shopId}|`;
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
    this.versions.set(shopId, this.version(shopId) + 1);
  }

  private async write(shopId: string, work: () => Promise<void>): Promise<void> {
    this.forget(shopId);
    try {
      await work();
    } finally {
      this.forget(shopId);
    }
  }

  getUser(uid: string): Promise<User | null> {
    return this.read(`user|${uid}`, () => this.inner.getUser(uid));
  }

  async saveUser(user: User): Promise<void> {
    this.entries.delete(`user|${user.uid}`);
    try {
      await this.inner.saveUser(user);
    } finally {
      this.entries.delete(`user|${user.uid}`);
    }
  }

  getShop(id: string): Promise<Shop | null> {
    return this.read(`${id}|shop`, () => this.inner.getShop(id));
  }

  saveShop(shop: Shop): Promise<void> {
    return this.write(shop.id, () => this.inner.saveShop(shop));
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
    return this.write(id, () => this.inner.deleteShop(id));
  }

  clearShop(id: string): Promise<void> {
    return this.write(id, () => this.inner.clearShop(id));
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

  listOrders(shopId: string): Promise<Order[]> {
    return this.read(`${shopId}|orders`, () => this.inner.listOrders(shopId));
  }

  /** From the cached list when there is one; otherwise a single read. */
  async getOrder(shopId: string, orderId: string): Promise<Order | null> {
    const list = this.peek<Order[]>(`${shopId}|orders`);
    if (list) return copy((await list).find((o) => o.id === orderId) ?? null);
    return this.read(`${shopId}|order:${orderId}`, () => this.inner.getOrder(shopId, orderId));
  }

  saveOrder(shopId: string, order: Order): Promise<void> {
    return this.write(shopId, () => this.inner.saveOrder(shopId, order));
  }

  listCases(shopId: string): Promise<Case[]> {
    return this.read(`${shopId}|cases`, () => this.inner.listCases(shopId));
  }

  async getCase(shopId: string, caseId: string): Promise<Case | null> {
    const list = this.peek<Case[]>(`${shopId}|cases`);
    if (list) return copy((await list).find((c) => c.id === caseId) ?? null);
    return this.read(`${shopId}|case:${caseId}`, () => this.inner.getCase(shopId, caseId));
  }

  saveCase(shopId: string, kase: Case): Promise<void> {
    return this.write(shopId, () => this.inner.saveCase(shopId, kase));
  }

  listEvents(shopId: string, caseId: string): Promise<CaseEvent[]> {
    return this.read(`${shopId}|events:${caseId}`, () => this.inner.listEvents(shopId, caseId));
  }

  addEvent(shopId: string, caseId: string, event: CaseEvent): Promise<void> {
    return this.write(shopId, () => this.inner.addEvent(shopId, caseId, event));
  }

  async getAnalysis(shopId: string, caseId: string): Promise<Analysis | null> {
    const list = this.peek<Analysis[]>(`${shopId}|analyses`);
    if (list) return copy((await list).find((a) => a.caseId === caseId) ?? null);
    return this.read(`${shopId}|analysis:${caseId}`, () => this.inner.getAnalysis(shopId, caseId));
  }

  saveAnalysis(shopId: string, analysis: Analysis): Promise<void> {
    return this.write(shopId, () => this.inner.saveAnalysis(shopId, analysis));
  }

  listAnalyses(shopId: string): Promise<Analysis[]> {
    return this.read(`${shopId}|analyses`, async () => {
      if (isBulk(this.inner)) return this.inner.listAnalyses(shopId);
      const cases = await this.inner.listCases(shopId);
      const found = await Promise.all(cases.map((c) => this.inner.getAnalysis(shopId, c.id)));
      return found.filter((a): a is Analysis => a !== null);
    });
  }

  listNotifications(shopId: string, limit: number): Promise<AppNotification[]> {
    return this.read(`${shopId}|notifications:${limit}`, () =>
      this.inner.listNotifications(shopId, limit),
    );
  }

  saveNotification(shopId: string, notification: AppNotification): Promise<void> {
    return this.write(shopId, () => this.inner.saveNotification(shopId, notification));
  }

  // Chats are one person's own and read one at a time, so they're never cached.
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
    return this.write(data.shop.id, async () => {
      if (!isBulk(this.inner)) throw new Error("This store can't replace a shop");
      await this.inner.replaceShop(data, fresh);
      for (const entry of data.cache ?? []) this.entries.delete(`cache|${entry.key}`);
    });
  }

  getCached<T>(key: string): Promise<T | null> {
    return this.read(`cache|${key}`, () => this.inner.getCached<T>(key));
  }

  async setCached<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.entries.delete(`cache|${key}`);
    try {
      await this.inner.setCached(key, value, ttlSeconds);
    } finally {
      this.entries.delete(`cache|${key}`);
    }
  }

  /** Counters are never cached: limits and the approval lock need exact totals. */
  increment(key: string, by: number, windowSeconds: number): Promise<number> {
    return this.inner.increment(key, by, windowSeconds);
  }
}

function copy<T>(value: T): T {
  return value === null || value === undefined ? value : structuredClone(value);
}
