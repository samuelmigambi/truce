import "server-only";

import { createHash } from "node:crypto";
import type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  Firestore,
} from "firebase-admin/firestore";
import type { Analysis, Case, CaseEvent, Order, Workspace } from "@/lib/domain";
import type { BulkStore, WorkspaceData } from "./bulk";
import { sortEvents, windowOf } from "./memory";
import type { Store } from "./types";

/**
 * The production store, on Firestore:
 * - workspaces/{id}, with orders, cases (each with its events) and analyses beneath it;
 * - cache/{key}, shared across workspaces, with an expiresAt for a TTL policy;
 * - counters/{key}~{window}, for rate limits and the daily spend.
 * firebase-admin loads on first use, so the memory store never pays for it.
 */

const APP_NAME = "truce";
/** Firestore's most writes in one batch. */
const BATCH_LIMIT = 500;

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

  private async workspace(id: string) {
    return (await this.firestore()).collection("workspaces").doc(docId(id));
  }

  private async collection(workspaceId: string, name: "orders" | "cases" | "analyses") {
    return (await this.workspace(workspaceId)).collection(name);
  }

  private async events(workspaceId: string, caseId: string) {
    return (await this.collection(workspaceId, "cases")).doc(docId(caseId)).collection("events");
  }

  async getWorkspace(id: string): Promise<Workspace | null> {
    const snap = await (await this.workspace(id)).get();
    return snap.exists ? (snap.data() as Workspace) : null;
  }

  async saveWorkspace(workspace: Workspace): Promise<void> {
    await (await this.workspace(workspace.id)).set(stripUndefined(workspace));
  }

  async clearWorkspace(id: string): Promise<void> {
    const db = await this.firestore();
    const names = ["orders", "cases", "analyses"] as const;
    // recursiveDelete takes the cases' events with them.
    await Promise.all(
      names.map(async (name) => db.recursiveDelete(await this.collection(id, name))),
    );
  }

  async listOrders(workspaceId: string): Promise<Order[]> {
    return all<Order>(await this.collection(workspaceId, "orders"));
  }

  async getOrder(workspaceId: string, orderId: string): Promise<Order | null> {
    const snap = await (await this.collection(workspaceId, "orders")).doc(docId(orderId)).get();
    return snap.exists ? (snap.data() as Order) : null;
  }

  async saveOrder(workspaceId: string, order: Order): Promise<void> {
    const ref = (await this.collection(workspaceId, "orders")).doc(docId(order.id));
    await ref.set(stripUndefined(order));
  }

  async listCases(workspaceId: string): Promise<Case[]> {
    return all<Case>(await this.collection(workspaceId, "cases"));
  }

  async getCase(workspaceId: string, caseId: string): Promise<Case | null> {
    const snap = await (await this.collection(workspaceId, "cases")).doc(docId(caseId)).get();
    return snap.exists ? (snap.data() as Case) : null;
  }

  async saveCase(workspaceId: string, kase: Case): Promise<void> {
    const ref = (await this.collection(workspaceId, "cases")).doc(docId(kase.id));
    await ref.set(stripUndefined(kase));
  }

  async listEvents(workspaceId: string, caseId: string): Promise<CaseEvent[]> {
    return sortEvents(await all<CaseEvent>(await this.events(workspaceId, caseId)));
  }

  async addEvent(workspaceId: string, caseId: string, event: CaseEvent): Promise<void> {
    await (await this.events(workspaceId, caseId)).doc(docId(event.id)).set(stripUndefined(event));
  }

  async getAnalysis(workspaceId: string, caseId: string): Promise<Analysis | null> {
    const snap = await (await this.collection(workspaceId, "analyses")).doc(docId(caseId)).get();
    return snap.exists ? (snap.data() as Analysis) : null;
  }

  async saveAnalysis(workspaceId: string, analysis: Analysis): Promise<void> {
    const ref = (await this.collection(workspaceId, "analyses")).doc(docId(analysis.caseId));
    await ref.set(stripUndefined(analysis));
  }

  async listAnalyses(workspaceId: string): Promise<Analysis[]> {
    return all<Analysis>(await this.collection(workspaceId, "analyses"));
  }

  /**
   * A whole demo copy in one atomic batch (a seed is about 330 writes; a batch takes 500), so it
   * costs one round trip and nothing can read it half-written. Records the new data doesn't have
   * are deleted in the same batch. Anything bigger goes in parallel batches, the workspace last.
   */
  async replaceWorkspace(data: WorkspaceData, fresh: boolean): Promise<void> {
    const { Timestamp } = await import("firebase-admin/firestore");
    const db = await this.firestore();
    const root = await this.workspace(data.workspace.id);
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
      const [orders, caseRefs, analyses] = await Promise.all([
        root.collection("orders").listDocuments(),
        cases.listDocuments(),
        root.collection("analyses").listDocuments(),
      ]);
      const events = (
        await Promise.all(caseRefs.map((ref) => ref.collection("events").listDocuments()))
      ).flat();
      for (const ref of [...orders, ...caseRefs, ...events, ...analyses]) {
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
    const workspace = { ref: root, data: stripUndefined(data.workspace) as DocumentData };
    if (writes.length < BATCH_LIMIT) {
      await commit([...writes, workspace]);
      return;
    }
    const parts: (typeof writes)[] = [];
    for (let i = 0; i < writes.length; i += BATCH_LIMIT)
      parts.push(writes.slice(i, i + BATCH_LIMIT));
    await Promise.all(parts.map(commit));
    await commit([workspace]);
  }

  async expiredWorkspaces(now: Date, limit: number): Promise<string[]> {
    const snap = await (
      await this.firestore()
    )
      .collection("workspaces")
      .where("expiresAt", "<=", now.toISOString())
      .orderBy("expiresAt")
      .limit(limit)
      .get();
    return snap.docs.map((doc) => (doc.data() as Workspace).id);
  }

  /** The workspace document, everything beneath it, and the shared cache entries named. */
  async deleteWorkspace(id: string, cacheKeys: string[] = []): Promise<void> {
    const db = await this.firestore();
    await Promise.all([
      db.recursiveDelete(await this.workspace(id)),
      ...cacheKeys.map((key) => db.collection("cache").doc(docId(key)).delete()),
    ]);
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

async function connect(projectId: string): Promise<Firestore> {
  const { applicationDefault, getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app =
    getApps().find((a) => a.name === APP_NAME) ??
    initializeApp({ credential: applicationDefault(), projectId }, APP_NAME);
  return getFirestore(app);
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
