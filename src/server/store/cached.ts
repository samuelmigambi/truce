import "server-only";

import type { Analysis, Case, CaseEvent, Order, Workspace } from "@/lib/domain";
import { isBulk, type BulkStore, type Versioned, type WorkspaceData } from "./bulk";
import type { Store } from "./types";

/**
 * A short-lived read cache in front of Firestore, inside this server process. A page asks for
 * cases, orders and metrics at once; each workspace's records are fetched once and shared, and
 * reads that arrive while a fetch is in flight wait for it instead of starting another. Any write
 * through this store drops that workspace's cached reads, so this process never serves stale data;
 * another server instance may, for at most the few seconds a read is kept.
 */

const DEFAULT_TTL_MS = 4_000;
/**
 * Workspace records change rarely (a reset, a sweep's timestamp), and every request reads one
 * first, so they're kept longer. A reset made the same day leaves the seed the same anyway.
 */
const WORKSPACE_TTL_MS = 30_000;
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

  version(workspaceId: string): number {
    return this.versions.get(workspaceId) ?? 0;
  }

  private ttlFor(key: string): number {
    return key.endsWith("|workspace") ? Math.max(this.ttlMs, WORKSPACE_TTL_MS) : this.ttlMs;
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

  /** Drops a workspace's cached reads, before a write and again after it lands. */
  private forget(workspaceId: string): void {
    const prefix = `${workspaceId}|`;
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
    this.versions.set(workspaceId, this.version(workspaceId) + 1);
  }

  private async write(workspaceId: string, work: () => Promise<void>): Promise<void> {
    this.forget(workspaceId);
    try {
      await work();
    } finally {
      this.forget(workspaceId);
    }
  }

  getWorkspace(id: string): Promise<Workspace | null> {
    return this.read(`${id}|workspace`, () => this.inner.getWorkspace(id));
  }

  saveWorkspace(workspace: Workspace): Promise<void> {
    return this.write(workspace.id, () => this.inner.saveWorkspace(workspace));
  }

  clearWorkspace(id: string): Promise<void> {
    return this.write(id, () => this.inner.clearWorkspace(id));
  }

  listOrders(workspaceId: string): Promise<Order[]> {
    return this.read(`${workspaceId}|orders`, () => this.inner.listOrders(workspaceId));
  }

  /** From the cached list when there is one; otherwise a single read. */
  async getOrder(workspaceId: string, orderId: string): Promise<Order | null> {
    const list = this.peek<Order[]>(`${workspaceId}|orders`);
    if (list) return copy((await list).find((o) => o.id === orderId) ?? null);
    return this.read(`${workspaceId}|order:${orderId}`, () =>
      this.inner.getOrder(workspaceId, orderId),
    );
  }

  saveOrder(workspaceId: string, order: Order): Promise<void> {
    return this.write(workspaceId, () => this.inner.saveOrder(workspaceId, order));
  }

  listCases(workspaceId: string): Promise<Case[]> {
    return this.read(`${workspaceId}|cases`, () => this.inner.listCases(workspaceId));
  }

  async getCase(workspaceId: string, caseId: string): Promise<Case | null> {
    const list = this.peek<Case[]>(`${workspaceId}|cases`);
    if (list) return copy((await list).find((c) => c.id === caseId) ?? null);
    return this.read(`${workspaceId}|case:${caseId}`, () =>
      this.inner.getCase(workspaceId, caseId),
    );
  }

  saveCase(workspaceId: string, kase: Case): Promise<void> {
    return this.write(workspaceId, () => this.inner.saveCase(workspaceId, kase));
  }

  listEvents(workspaceId: string, caseId: string): Promise<CaseEvent[]> {
    return this.read(`${workspaceId}|events:${caseId}`, () =>
      this.inner.listEvents(workspaceId, caseId),
    );
  }

  addEvent(workspaceId: string, caseId: string, event: CaseEvent): Promise<void> {
    return this.write(workspaceId, () => this.inner.addEvent(workspaceId, caseId, event));
  }

  async getAnalysis(workspaceId: string, caseId: string): Promise<Analysis | null> {
    const list = this.peek<Analysis[]>(`${workspaceId}|analyses`);
    if (list) return copy((await list).find((a) => a.caseId === caseId) ?? null);
    return this.read(`${workspaceId}|analysis:${caseId}`, () =>
      this.inner.getAnalysis(workspaceId, caseId),
    );
  }

  saveAnalysis(workspaceId: string, analysis: Analysis): Promise<void> {
    return this.write(workspaceId, () => this.inner.saveAnalysis(workspaceId, analysis));
  }

  listAnalyses(workspaceId: string): Promise<Analysis[]> {
    return this.read(`${workspaceId}|analyses`, async () => {
      if (isBulk(this.inner)) return this.inner.listAnalyses(workspaceId);
      const cases = await this.inner.listCases(workspaceId);
      const found = await Promise.all(cases.map((c) => this.inner.getAnalysis(workspaceId, c.id)));
      return found.filter((a): a is Analysis => a !== null);
    });
  }

  replaceWorkspace(data: WorkspaceData, fresh: boolean): Promise<void> {
    return this.write(data.workspace.id, async () => {
      if (!isBulk(this.inner)) throw new Error("This store can't replace a workspace");
      await this.inner.replaceWorkspace(data, fresh);
      for (const entry of data.cache ?? []) this.entries.delete(`cache|${entry.key}`);
    });
  }

  expiredWorkspaces(now: Date, limit: number): Promise<string[]> {
    return isBulk(this.inner) ? this.inner.expiredWorkspaces(now, limit) : Promise.resolve([]);
  }

  deleteWorkspace(id: string, cacheKeys: string[] = []): Promise<void> {
    return this.write(id, async () => {
      if (isBulk(this.inner)) await this.inner.deleteWorkspace(id, cacheKeys);
      else await this.inner.clearWorkspace(id);
      for (const key of cacheKeys) this.entries.delete(`cache|${key}`);
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
