import "server-only";

import type { Analysis, Case, CaseEvent, Order, Workspace } from "@/lib/domain";
import type { BulkStore, Versioned, WorkspaceData } from "./bulk";
import type { Store } from "./types";

/** One workspace's records, keyed by ID. */
interface Bucket {
  orders: Map<string, Order>;
  cases: Map<string, Case>;
  /** Case ID to its events, keyed by event ID. */
  events: Map<string, Map<string, CaseEvent>>;
  analyses: Map<string, Analysis>;
}

/**
 * The store for tests and for running without Google credentials. Records are copied in and out,
 * so a caller holding an object can't change what's stored by accident.
 */
export class MemoryStore implements Store, BulkStore, Versioned {
  readonly kind = "memory" as const;
  private workspaces = new Map<string, Workspace>();
  private buckets = new Map<string, Bucket>();
  private cache = new Map<string, { value: unknown; expiresAt: number | null }>();
  private counters = new Map<string, { window: number; total: number }>();
  private versions = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Empties everything; for tests. */
  reset(): void {
    this.workspaces.clear();
    this.buckets.clear();
    this.cache.clear();
    this.counters.clear();
    this.versions.clear();
  }

  version(workspaceId: string): number {
    return this.versions.get(workspaceId) ?? 0;
  }

  private touch(workspaceId: string): void {
    this.versions.set(workspaceId, this.version(workspaceId) + 1);
  }

  private bucket(workspaceId: string): Bucket {
    let bucket = this.buckets.get(workspaceId);
    if (!bucket) {
      bucket = { orders: new Map(), cases: new Map(), events: new Map(), analyses: new Map() };
      this.buckets.set(workspaceId, bucket);
    }
    return bucket;
  }

  async getWorkspace(id: string): Promise<Workspace | null> {
    return copyOrNull(this.workspaces.get(id));
  }

  async saveWorkspace(workspace: Workspace): Promise<void> {
    this.workspaces.set(workspace.id, copy(workspace));
    this.touch(workspace.id);
  }

  async clearWorkspace(id: string): Promise<void> {
    this.buckets.delete(id);
    this.touch(id);
  }

  async listOrders(workspaceId: string): Promise<Order[]> {
    return [...this.bucket(workspaceId).orders.values()].map(copy);
  }

  async getOrder(workspaceId: string, orderId: string): Promise<Order | null> {
    return copyOrNull(this.bucket(workspaceId).orders.get(orderId));
  }

  async saveOrder(workspaceId: string, order: Order): Promise<void> {
    this.bucket(workspaceId).orders.set(order.id, copy(order));
    this.touch(workspaceId);
  }

  async listCases(workspaceId: string): Promise<Case[]> {
    return [...this.bucket(workspaceId).cases.values()].map(copy);
  }

  async getCase(workspaceId: string, caseId: string): Promise<Case | null> {
    return copyOrNull(this.bucket(workspaceId).cases.get(caseId));
  }

  async saveCase(workspaceId: string, kase: Case): Promise<void> {
    this.bucket(workspaceId).cases.set(kase.id, copy(kase));
    this.touch(workspaceId);
  }

  async listEvents(workspaceId: string, caseId: string): Promise<CaseEvent[]> {
    const events = this.bucket(workspaceId).events.get(caseId);
    return sortEvents([...(events?.values() ?? [])].map(copy));
  }

  /** Saving an event with an ID that's already there replaces it, as Firestore does. */
  async addEvent(workspaceId: string, caseId: string, event: CaseEvent): Promise<void> {
    const all = this.bucket(workspaceId).events;
    let events = all.get(caseId);
    if (!events) {
      events = new Map();
      all.set(caseId, events);
    }
    events.set(event.id, copy(event));
    this.touch(workspaceId);
  }

  async getAnalysis(workspaceId: string, caseId: string): Promise<Analysis | null> {
    return copyOrNull(this.bucket(workspaceId).analyses.get(caseId));
  }

  async saveAnalysis(workspaceId: string, analysis: Analysis): Promise<void> {
    this.bucket(workspaceId).analyses.set(analysis.caseId, copy(analysis));
    this.touch(workspaceId);
  }

  async listAnalyses(workspaceId: string): Promise<Analysis[]> {
    return [...this.bucket(workspaceId).analyses.values()].map(copy);
  }

  async replaceWorkspace(data: WorkspaceData): Promise<void> {
    const id = data.workspace.id;
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
    };
    this.buckets.set(id, bucket);
    for (const entry of data.cache ?? [])
      await this.setCached(entry.key, entry.value, entry.ttlSeconds);
    this.workspaces.set(id, copy(data.workspace));
    this.touch(id);
  }

  async expiredWorkspaces(now: Date, limit: number): Promise<string[]> {
    return [...this.workspaces.values()]
      .filter((w) => w.expiresAt !== null && Date.parse(w.expiresAt) <= now.getTime())
      .sort((a, b) => (a.expiresAt ?? "").localeCompare(b.expiresAt ?? ""))
      .slice(0, limit)
      .map((w) => w.id);
  }

  async deleteWorkspace(id: string, cacheKeys: string[] = []): Promise<void> {
    this.workspaces.delete(id);
    this.buckets.delete(id);
    for (const key of cacheKeys) this.cache.delete(key);
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
