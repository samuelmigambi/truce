import type { ChatSummary, ChatThread } from "@/lib/chat-thread";
import type { Analysis, AppNotification, Case, CaseEvent, Order, Shop, User } from "@/lib/domain";

/** The names of the secrets a shop can hold. */
export type SecretName = "paypal";

/**
 * A secret sealed with AES-256-GCM (see src/server/crypto/secrets.ts): its own random data key
 * encrypts it, and the master key wraps that data key. Only ciphertext is ever stored.
 */
export interface SealedSecret {
  v: 1;
  alg: "A256GCM";
  /** The master key that wrapped the data key, by fingerprint, so keys can rotate. */
  kid: string;
  /** The wrapped data key: base64 IV, auth tag and ciphertext. */
  key: { iv: string; tag: string; data: string };
  /** The secret itself, encrypted with the data key. */
  iv: string;
  tag: string;
  data: string;
  createdAt: string;
}

/**
 * Where Truce keeps its data. Firestore in production:
 * - users/{uid};
 * - shops/{shopId}, with orders, cases (each with its events), analyses, notifications and
 *   secrets beneath it, and each member's Ask Truce chats under members/{uid}/chats;
 * - cache/{key} and counters/{key}~{window}, shared.
 * An in-memory store serves tests and running without Google credentials. Every record method
 * is scoped to one shop, so one shop never sees another's data.
 */
export interface Store {
  readonly kind: "firestore" | "memory";

  getUser(uid: string): Promise<User | null>;
  saveUser(user: User): Promise<void>;

  getShop(id: string): Promise<Shop | null>;
  saveShop(shop: Shop): Promise<void>;
  /** Every shop this person is a member of. */
  listShopsFor(uid: string): Promise<Shop[]>;
  /** Every real shop with a PayPal connection: for the overnight job. */
  listConnectedShops(): Promise<Shop[]>;
  /** The shops connected to the PayPal app with this client ID hash. */
  listShopsByPayPalApp(clientIdHash: string): Promise<Shop[]>;
  /** Deletes the shop and everything beneath it, its secrets included. */
  deleteShop(id: string): Promise<void>;
  /** Deletes the shop's orders, cases, events, analyses and notifications; keeps the shop. */
  clearShop(id: string): Promise<void>;

  getSecret(shopId: string, name: SecretName): Promise<SealedSecret | null>;
  saveSecret(shopId: string, name: SecretName, secret: SealedSecret): Promise<void>;
  deleteSecret(shopId: string, name: SecretName): Promise<void>;

  listOrders(shopId: string): Promise<Order[]>;
  getOrder(shopId: string, orderId: string): Promise<Order | null>;
  saveOrder(shopId: string, order: Order): Promise<void>;

  listCases(shopId: string): Promise<Case[]>;
  getCase(shopId: string, caseId: string): Promise<Case | null>;
  saveCase(shopId: string, kase: Case): Promise<void>;

  listEvents(shopId: string, caseId: string): Promise<CaseEvent[]>;
  addEvent(shopId: string, caseId: string, event: CaseEvent): Promise<void>;

  getAnalysis(shopId: string, caseId: string): Promise<Analysis | null>;
  saveAnalysis(shopId: string, analysis: Analysis): Promise<void>;

  /** The newest first, at most `limit`. */
  listNotifications(shopId: string, limit: number): Promise<AppNotification[]>;
  /** Saving one with an ID that's already there replaces it. */
  saveNotification(shopId: string, notification: AppNotification): Promise<void>;

  /** One person's chats in a shop, the most recently updated first, at most `limit`. */
  listChats(shopId: string, uid: string, limit: number): Promise<ChatSummary[]>;
  /** One of this person's chats; null when it isn't there or isn't theirs. */
  getChat(shopId: string, uid: string, chatId: string): Promise<ChatThread | null>;
  /** Saving one with an ID that's already there replaces it. */
  saveChat(shopId: string, chat: ChatThread): Promise<void>;
  deleteChat(shopId: string, uid: string, chatId: string): Promise<void>;
  /** Every member's chats in the shop, for starting a sample shop over. */
  clearChats(shopId: string): Promise<void>;

  /** A shared cache across shops, such as a sample case's recorded analysis or an embedding. */
  getCached<T>(key: string): Promise<T | null>;
  setCached<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /** Adds to a counter in a time window and returns the new total (rate limits, daily spend). */
  increment(key: string, by: number, windowSeconds: number): Promise<number>;
}
