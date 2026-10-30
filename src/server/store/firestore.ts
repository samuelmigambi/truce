import "server-only";

import { createHash } from "node:crypto";
import type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  Firestore,
} from "firebase-admin/firestore";
import {
  MAX_SAVED_MESSAGES,
  summaryOf,
  type ChatMessage,
  type ChatSummary,
  type ChatThread,
} from "@/lib/chat-thread";
import type { Analysis, AppNotification, Case, CaseEvent, Order, Shop, User } from "@/lib/domain";
import { adminApp } from "@/server/firebase";
import type { BulkStore, ShopData } from "./bulk";
import { sortEvents, windowOf } from "./memory";
import type { SealedSecret, SecretName, Store } from "./types";

/**
 * The production store, on Firestore:
 * - users/{uid};
 * - shops/{shopId}, with orders, cases (each with its events), analyses, notifications and
 *   secrets beneath it. A shop's document also carries `paypalApp`, the hash of its PayPal
 *   app's client ID (or null), so connected shops can be found with one query;
 * - shops/{shopId}/members/{uid}/chats/{chatId}: each member's Ask Truce chats, under their own
 *   path so listing them needs no composite index. The messages are kept as JSON text;
 * - cache/{key}, shared across shops, with an expiresAt for a TTL policy;
 * - counters/{key}~{window}, for rate limits and the daily spend.
 * Security rules deny every client: only this server, through the admin SDK, reads or writes.
 */

/** Firestore's most writes in one batch. */
const BATCH_LIMIT = 500;
type ShopCollection = "orders" | "cases" | "analyses" | "notifications" | "secrets";

export class FirestoreStore implements Store, BulkStore {
  readonly kind = "firestore" as const;
  private db: Promise<Firestore> | null = null;

  constructor(
    private readonly projectId: string,
    private readonly now: () => number = Date.now,
  ) {}

  private firestore(): Promise<Firestore> {
    this.db ??= connect(this.projectId).catch((error: unknown) => {
      // Let the next call try again instead of keeping a failed connection.
      this.db = null;
      throw error;
    });
    return this.db;
  }

  private async shopDoc(id: string) {
    return (await this.firestore()).collection("shops").doc(docId(id));
  }

  private async collection(shopId: string, name: ShopCollection) {
    return (await this.shopDoc(shopId)).collection(name);
  }

  private async events(shopId: string, caseId: string) {
    return (await this.collection(shopId, "cases")).doc(docId(caseId)).collection("events");
  }

  async getUser(uid: string): Promise<User | null> {
    const snap = await (await this.firestore()).collection("users").doc(docId(uid)).get();
    return snap.exists ? (snap.data() as User) : null;
  }

  async saveUser(user: User): Promise<void> {
    await (
      await this.firestore()
    )
      .collection("users")
      .doc(docId(user.uid))
      .set(stripUndefined(user));
  }

  async getShop(id: string): Promise<Shop | null> {
    const snap = await (await this.shopDoc(id)).get();
    return snap.exists ? fromShopDoc(snap.data()!) : null;
  }

  async saveShop(shop: Shop): Promise<void> {
    await (await this.shopDoc(shop.id)).set(toShopDoc(shop));
  }

  async listShopsFor(uid: string): Promise<Shop[]> {
    const snap = await (
      await this.firestore()
    )
      .collection("shops")
      .where("memberIds", "array-contains", uid)
      .get();
    return snap.docs.map((doc) => fromShopDoc(doc.data()));
  }

  async listConnectedShops(): Promise<Shop[]> {
    const snap = await (
      await this.firestore()
    )
      .collection("shops")
      .where("paypalApp", "!=", null)
      .get();
    return snap.docs.map((doc) => fromShopDoc(doc.data())).filter((s) => s.kind === "real");
  }

  async listShopsByPayPalApp(clientIdHash: string): Promise<Shop[]> {
    const snap = await (
      await this.firestore()
    )
      .collection("shops")
      .where("paypalApp", "==", clientIdHash)
      .get();
    return snap.docs.map((doc) => fromShopDoc(doc.data())).filter((s) => s.kind === "real");
  }

  /** The shop's document and everything beneath it; recursiveDelete takes the subcollections. */
  async deleteShop(id: string): Promise<void> {
    const db = await this.firestore();
    await db.recursiveDelete(await this.shopDoc(id));
  }

  async clearShop(id: string): Promise<void> {
    const db = await this.firestore();
    const names = ["orders", "cases", "analyses", "notifications"] as const;
    await Promise.all(
      names.map(async (name) => db.recursiveDelete(await this.collection(id, name))),
    );
  }

  async getSecret(shopId: string, name: SecretName): Promise<SealedSecret | null> {
    const snap = await (await this.collection(shopId, "secrets")).doc(name).get();
    return snap.exists ? (snap.data() as SealedSecret) : null;
  }

  async saveSecret(shopId: string, name: SecretName, secret: SealedSecret): Promise<void> {
    await (await this.collection(shopId, "secrets")).doc(name).set(stripUndefined(secret));
  }

  async deleteSecret(shopId: string, name: SecretName): Promise<void> {
    await (await this.collection(shopId, "secrets")).doc(name).delete();
  }

  async listOrders(shopId: string): Promise<Order[]> {
    return all<Order>(await this.collection(shopId, "orders"));
  }

  async getOrder(shopId: string, orderId: string): Promise<Order | null> {
    const snap = await (await this.collection(shopId, "orders")).doc(docId(orderId)).get();
    return snap.exists ? (snap.data() as Order) : null;
  }

  async saveOrder(shopId: string, order: Order): Promise<void> {
    const ref = (await this.collection(shopId, "orders")).doc(docId(order.id));
    await ref.set(stripUndefined(order));
  }

  async listCases(shopId: string): Promise<Case[]> {
    return all<Case>(await this.collection(shopId, "cases"));
  }

  async getCase(shopId: string, caseId: string): Promise<Case | null> {
    const snap = await (await this.collection(shopId, "cases")).doc(docId(caseId)).get();
    return snap.exists ? (snap.data() as Case) : null;
  }

  async saveCase(shopId: string, kase: Case): Promise<void> {
    const ref = (await this.collection(shopId, "cases")).doc(docId(kase.id));
    await ref.set(stripUndefined(kase));
  }

  async listEvents(shopId: string, caseId: string): Promise<CaseEvent[]> {
    return sortEvents(await all<CaseEvent>(await this.events(shopId, caseId)));
  }

  async addEvent(shopId: string, caseId: string, event: CaseEvent): Promise<void> {
    await (await this.events(shopId, caseId)).doc(docId(event.id)).set(stripUndefined(event));
  }

  async getAnalysis(shopId: string, caseId: string): Promise<Analysis | null> {
    const snap = await (await this.collection(shopId, "analyses")).doc(docId(caseId)).get();
    return snap.exists ? (snap.data() as Analysis) : null;
  }

  async saveAnalysis(shopId: string, analysis: Analysis): Promise<void> {
    const ref = (await this.collection(shopId, "analyses")).doc(docId(analysis.caseId));
    await ref.set(stripUndefined(analysis));
  }

  async listAnalyses(shopId: string): Promise<Analysis[]> {
    return all<Analysis>(await this.collection(shopId, "analyses"));
  }

  private async chats(shopId: string, uid: string) {
    return (await this.shopDoc(shopId)).collection("members").doc(docId(uid)).collection("chats");
  }

  async listChats(shopId: string, uid: string, limit: number): Promise<ChatSummary[]> {
    const snap = await (
      await this.chats(shopId, uid)
    )
      .orderBy("updatedAt", "desc")
      .limit(limit)
      .select("id", "title", "createdAt", "updatedAt", "messageCount")
      .get();
    return snap.docs.map((doc) => doc.data() as ChatSummary);
  }

  async getChat(shopId: string, uid: string, chatId: string): Promise<ChatThread | null> {
    const snap = await (await this.chats(shopId, uid)).doc(docId(chatId)).get();
    return snap.exists ? fromChatDoc(snap.data()!) : null;
  }

  async saveChat(shopId: string, chat: ChatThread): Promise<void> {
    await (await this.chats(shopId, chat.uid)).doc(docId(chat.id)).set(toChatDoc(chat));
  }

  async deleteChat(shopId: string, uid: string, chatId: string): Promise<void> {
    await (await this.chats(shopId, uid)).doc(docId(chatId)).delete();
  }

  async clearChats(shopId: string): Promise<void> {
    const db = await this.firestore();
    await db.recursiveDelete((await this.shopDoc(shopId)).collection("members"));
  }

  async listNotifications(shopId: string, limit: number): Promise<AppNotification[]> {
    const snap = await (
      await this.collection(shopId, "notifications")
    )
      .orderBy("at", "desc")
      .limit(limit)
      .get();
    return snap.docs.map((doc) => doc.data() as AppNotification);
  }

  async saveNotification(shopId: string, notification: AppNotification): Promise<void> {
    const ref = (await this.collection(shopId, "notifications")).doc(docId(notification.id));
    await ref.set(stripUndefined(notification));
  }

  /**
   * A whole sample shop in one atomic batch where it fits, so nothing reads it half-written.
   * Records the new data doesn't have are deleted in the same batch; anything bigger goes in
   * parallel batches, the shop's own document last.
   */
  async replaceShop(data: ShopData, fresh: boolean): Promise<void> {
    const { Timestamp } = await import("firebase-admin/firestore");
    const db = await this.firestore();
    const root = await this.shopDoc(data.shop.id);
    const writes: { ref: DocumentReference; data?: DocumentData }[] = [];
    const put = (ref: DocumentReference, value: object) =>
      writes.push({ ref, data: stripUndefined(value) as DocumentData });
    const cases = root.collection("cases");
    for (const order of data.orders) put(root.collection("orders").doc(docId(order.id)), order);
    for (const kase of data.cases) put(cases.doc(docId(kase.id)), kase);
    for (const [caseId, events] of Object.entries(data.events)) {
      const list = cases.doc(docId(caseId)).collection("events");
      for (const event of events) put(list.doc(docId(event.id)), event);
    }
    for (const entry of data.cache ?? []) {
      const expiresAt = entry.ttlSeconds
        ? Timestamp.fromMillis(this.now() + entry.ttlSeconds * 1000)
        : null;
      put(db.collection("cache").doc(docId(entry.key)), {
        key: entry.key,
        json: JSON.stringify(entry.value),
        expiresAt,
      });
    }
    if (!fresh) {
      const keep = new Set(writes.map((w) => w.ref.path));
      const [orders, caseRefs, analyses, notifications] = await Promise.all([
        root.collection("orders").listDocuments(),
        cases.listDocuments(),
        root.collection("analyses").listDocuments(),
        data.keepNotifications
          ? Promise.resolve([])
          : root.collection("notifications").listDocuments(),
      ]);
      const events = (
        await Promise.all(caseRefs.map((ref) => ref.collection("events").listDocuments()))
      ).flat();
      for (const ref of [...orders, ...caseRefs, ...events, ...analyses, ...notifications]) {
        if (!keep.has(ref.path)) writes.push({ ref });
      }
    }
    const commit = (part: typeof writes) => {
      const batch = db.batch();
      for (const w of part) {
        if (w.data) batch.set(w.ref, w.data);
        else batch.delete(w.ref);
      }
      return batch.commit();
    };
    const shop = { ref: root, data: toShopDoc(data.shop) };
    if (writes.length < BATCH_LIMIT) {
      await commit([...writes, shop]);
      return;
    }
    const parts: (typeof writes)[] = [];
    for (let i = 0; i < writes.length; i += BATCH_LIMIT)
      parts.push(writes.slice(i, i + BATCH_LIMIT));
    await Promise.all(parts.map(commit));
    await commit([shop]);
  }

  /** Cached values are kept as JSON text, so any shape fits (Firestore refuses nested arrays). */
  async getCached<T>(key: string): Promise<T | null> {
    const snap = await (await this.firestore()).collection("cache").doc(docId(key)).get();
    if (!snap.exists) return null;
    const data = snap.data() as { json?: string; expiresAt?: { toMillis(): number } | null };
    if (data.expiresAt && data.expiresAt.toMillis() <= this.now()) return null;
    return typeof data.json === "string" ? (JSON.parse(data.json) as T) : null;
  }

  async setCached<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const { Timestamp } = await import("firebase-admin/firestore");
    const expiresAt = ttlSeconds ? Timestamp.fromMillis(this.now() + ttlSeconds * 1000) : null;
    const ref = (await this.firestore()).collection("cache").doc(docId(key));
    await ref.set({ key, json: JSON.stringify(value), expiresAt });
  }

  /**
   * A transaction, so each caller gets its own exact total: the approval lock relies on the
   * first of two taps seeing 1 and the second seeing 2. A read of 0 needs no transaction.
   */
  async increment(key: string, by: number, windowSeconds: number): Promise<number> {
    const { Timestamp } = await import("firebase-admin/firestore");
    const db = await this.firestore();
    const window = windowOf(this.now(), windowSeconds);
    const ref = db.collection("counters").doc(`${docId(key)}~${window}`);
    if (by === 0) return ((await ref.get()).data()?.total as number | undefined) ?? 0;
    const ends = Timestamp.fromMillis((window + 1) * Math.max(1, windowSeconds) * 1000);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const total = ((snap.data()?.total as number | undefined) ?? 0) + by;
      tx.set(ref, { key, total, expiresAt: ends });
      return total;
    });
  }
}

/** The shop as stored: the shop, plus the field that finds the shops on one PayPal app. */
function toShopDoc(shop: Shop): DocumentData {
  return stripUndefined({ ...shop, paypalApp: shop.paypal?.clientIdHash ?? null }) as DocumentData;
}

function fromShopDoc(data: DocumentData): Shop {
  const { paypalApp: _paypalApp, ...shop } = data as Shop & { paypalApp?: unknown };
  void _paypalApp;
  return shop as Shop;
}

/** Firestore keeps a document under 1 MiB; a long chat drops its oldest messages to fit. */
const CHAT_JSON_LIMIT = 700_000;

/**
 * A chat as stored: the list's fields on their own, the messages as JSON text (Firestore refuses
 * nested arrays, and a card can hold one).
 */
function toChatDoc(chat: ChatThread): DocumentData {
  let messages: ChatMessage[] = chat.messages.slice(-MAX_SAVED_MESSAGES);
  let json = JSON.stringify(messages);
  while (json.length > CHAT_JSON_LIMIT && messages.length > 2) {
    messages = messages.slice(2);
    json = JSON.stringify(messages);
  }
  const summary = summaryOf({ ...chat, messages });
  return { ...summary, uid: chat.uid, json };
}

function fromChatDoc(data: DocumentData): ChatThread {
  const { json, ...rest } = data as ChatSummary & { uid: string; json?: string };
  return {
    id: rest.id,
    uid: rest.uid,
    title: rest.title,
    createdAt: rest.createdAt,
    updatedAt: rest.updatedAt,
    messages: typeof json === "string" ? (JSON.parse(json) as ChatMessage[]) : [],
  };
}

async function connect(projectId: string): Promise<Firestore> {
  const { getFirestore } = await import("firebase-admin/firestore");
  return getFirestore(await adminApp(projectId));
}

async function all<T>(collection: CollectionReference<DocumentData>): Promise<T[]> {
  const snap = await collection.get();
  return snap.docs.map((doc) => doc.data() as T);
}

/**
 * A safe Firestore document ID for any key: no slashes, never "." or "..", and short enough.
 * Order and case IDs such as "W-1042" stay as they are.
 */
export function docId(key: string): string {
  const safe = encodeURIComponent(key).replace(/\./g, "%2E");
  if (safe.length > 0 && safe.length <= 200 && !/^__.*__$/.test(safe)) return safe;
  return `h-${createHash("sha256").update(key).digest("hex")}`;
}

/** Firestore rejects undefined values, so drop them (at any depth) before writing. */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined).map((item) => stripUndefined(item)) as T;
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[key] = stripUndefined(item);
    }
    return out as T;
  }
  return value;
}
