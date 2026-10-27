import "server-only";

import type { Analysis, Case, CaseEvent, Order, Workspace } from "@/lib/domain";
import {
  versionOf,
  type BulkStore,
  type SeedOnRead,
  type Versioned,
  type WorkspaceData,
} from "@/server/store/bulk";
import { sortEvents } from "@/server/store/memory";
import type { Store } from "@/server/store/types";
import { isCurrentSeed, seedOf, type DemoSeed } from "./seed";

/**
 * Demo copies on Firestore, without writing the seed. The seed is the same for every copy made on
 * a given day, so it's worked out in memory from the copy's creation day; Firestore keeps only
 * what changed since: replies, refunds, new scans, approvals, analyses. A stored record replaces
 * the seeded one with the same ID. A new copy is then one small write instead of about 600 KB,
 * and reads fetch a handful of records instead of every order.
 */
export class SeededStore implements Store, BulkStore, Versioned, SeedOnRead {
  readonly kind: Store["kind"];
  readonly seedsOnRead = true as const;

  constructor(private readonly inner: Store & BulkStore) {
    this.kind = inner.kind;
  }

  /** The seed behind a demo copy; null for the live workspace or a copy from an older seed. */
  private async base(workspaceId: string): Promise<DemoSeed | null> {
    const workspace = await this.inner.getWorkspace(workspaceId);
    if (!workspace || workspace.kind !== "demo" || !isCurrentSeed(workspace.seedVersion)) {
      return null;
    }
    return seedOf(workspace.createdAt);
  }

  version(workspaceId: string): number {
    return versionOf(this.inner, workspaceId) ?? 0;
  }

  getWorkspace(id: string): Promise<Workspace | null> {
    return this.inner.getWorkspace(id);
  }

  saveWorkspace(workspace: Workspace): Promise<void> {
    return this.inner.saveWorkspace(workspace);
  }

  /** Removes what was stored; the seed itself stays, as it's never stored. */
  clearWorkspace(id: string): Promise<void> {
    return this.inner.clearWorkspace(id);
  }

  async listOrders(workspaceId: string): Promise<Order[]> {
    const [base, stored] = await Promise.all([
      this.base(workspaceId),
      this.inner.listOrders(workspaceId),
    ]);
    return merge(base?.orders, stored);
  }

  async getOrder(workspaceId: string, orderId: string): Promise<Order | null> {
    const [base, stored] = await Promise.all([
      this.base(workspaceId),
      this.inner.getOrder(workspaceId, orderId),
    ]);
    return stored ?? seeded(base?.orders.find((o) => o.id === orderId));
  }

  saveOrder(workspaceId: string, order: Order): Promise<void> {
    return this.inner.saveOrder(workspaceId, order);
  }

  async listCases(workspaceId: string): Promise<Case[]> {
    const [base, stored] = await Promise.all([
      this.base(workspaceId),
      this.inner.listCases(workspaceId),
    ]);
    return merge(base?.cases, stored);
  }

  async getCase(workspaceId: string, caseId: string): Promise<Case | null> {
    const [base, stored] = await Promise.all([
      this.base(workspaceId),
      this.inner.getCase(workspaceId, caseId),
    ]);
    return stored ?? seeded(base?.cases.find((c) => c.id === caseId));
  }

  saveCase(workspaceId: string, kase: Case): Promise<void> {
    return this.inner.saveCase(workspaceId, kase);
  }

  async listEvents(workspaceId: string, caseId: string): Promise<CaseEvent[]> {
    const [base, stored] = await Promise.all([
      this.base(workspaceId),
      this.inner.listEvents(workspaceId, caseId),
    ]);
    return sortEvents(merge(base?.events[caseId], stored));
  }

  addEvent(workspaceId: string, caseId: string, event: CaseEvent): Promise<void> {
    return this.inner.addEvent(workspaceId, caseId, event);
  }

  getAnalysis(workspaceId: string, caseId: string): Promise<Analysis | null> {
    return this.inner.getAnalysis(workspaceId, caseId);
  }

  saveAnalysis(workspaceId: string, analysis: Analysis): Promise<void> {
    return this.inner.saveAnalysis(workspaceId, analysis);
  }

  listAnalyses(workspaceId: string): Promise<Analysis[]> {
    return this.inner.listAnalyses(workspaceId);
  }

  replaceWorkspace(data: WorkspaceData, fresh: boolean): Promise<void> {
    return this.inner.replaceWorkspace(data, fresh);
  }

  expiredWorkspaces(now: Date, limit: number): Promise<string[]> {
    return this.inner.expiredWorkspaces(now, limit);
  }

  deleteWorkspace(id: string, cacheKeys?: string[]): Promise<void> {
    return this.inner.deleteWorkspace(id, cacheKeys);
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
