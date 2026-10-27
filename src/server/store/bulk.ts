import "server-only";

import type { Analysis, Case, CaseEvent, Order, Workspace } from "@/lib/domain";
import type { Store } from "./types";

/**
 * What Truce's own stores can do beyond the Store contract, where it saves round trips: write a
 * whole workspace in one go, read every analysis in one query, and clean up expired demo copies.
 * It's optional, so other Store implementations (such as test fakes) still fit.
 */

/** Everything one workspace holds, written at once when a demo copy is seeded. */
export interface WorkspaceData {
  workspace: Workspace;
  orders: Order[];
  cases: Case[];
  /** Each case's events. */
  events: Record<string, CaseEvent[]>;
  /** Shared cache entries that belong with it, such as the copy's pending scans. */
  cache?: { key: string; value: unknown; ttlSeconds?: number }[];
}

export interface BulkStore {
  /**
   * Replaces the workspace's records with these, removing any others (analyses included).
   * `fresh` says the workspace is brand new, so there's nothing to remove.
   */
  replaceWorkspace(data: WorkspaceData, fresh: boolean): Promise<void>;
  listAnalyses(workspaceId: string): Promise<Analysis[]>;
  /** IDs of workspaces whose expiresAt has passed, at most `limit`. */
  expiredWorkspaces(now: Date, limit: number): Promise<string[]>;
  /** Deletes a workspace, everything under it, and the given shared cache entries. */
  deleteWorkspace(id: string, cacheKeys?: string[]): Promise<void>;
}

/**
 * A store that works a demo copy's seed out on read, from the copy's creation day, instead of
 * keeping the seeded records; only what changes afterwards is stored.
 */
export interface SeedOnRead {
  readonly seedsOnRead: true;
}

export function seedsOnRead(store: Store): boolean {
  return (store as Partial<SeedOnRead>).seedsOnRead === true;
}

/** A count that goes up with every write to a workspace, for caches that live in this process. */
export interface Versioned {
  version(workspaceId: string): number;
}

export function isBulk(store: Store): store is Store & BulkStore {
  return typeof (store as Partial<BulkStore>).replaceWorkspace === "function";
}

/** The workspace's write count, or null when the store doesn't keep one. */
export function versionOf(store: Store, workspaceId: string): number | null {
  const versioned = store as Partial<Versioned>;
  return typeof versioned.version === "function" ? versioned.version(workspaceId) : null;
}

/** Every analysis in the workspace: one query where the store can, one read per case otherwise. */
export async function allAnalyses(
  store: Store,
  workspaceId: string,
  cases: Case[],
): Promise<Analysis[]> {
  if (isBulk(store)) return store.listAnalyses(workspaceId);
  const found = await Promise.all(cases.map((c) => store.getAnalysis(workspaceId, c.id)));
  return found.filter((a): a is Analysis => a !== null);
}
