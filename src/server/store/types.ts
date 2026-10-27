import type { Analysis, Case, CaseEvent, Order, Workspace } from "@/lib/domain";

/**
 * Where Truce keeps its data. Firestore in production (workspaces/{id}/orders|cases|analyses,
 * cases/{id}/events); an in-memory store for tests and for running without Google credentials.
 * Every method is scoped to a workspace, so one visitor's demo copy never sees another's.
 */
export interface Store {
  readonly kind: "firestore" | "memory";

  getWorkspace(id: string): Promise<Workspace | null>;
  saveWorkspace(workspace: Workspace): Promise<void>;
  /** Deletes the workspace's orders, cases, events and analyses (for "reset demo"). */
  clearWorkspace(id: string): Promise<void>;

  listOrders(workspaceId: string): Promise<Order[]>;
  getOrder(workspaceId: string, orderId: string): Promise<Order | null>;
  saveOrder(workspaceId: string, order: Order): Promise<void>;

  listCases(workspaceId: string): Promise<Case[]>;
  getCase(workspaceId: string, caseId: string): Promise<Case | null>;
  saveCase(workspaceId: string, kase: Case): Promise<void>;

  listEvents(workspaceId: string, caseId: string): Promise<CaseEvent[]>;
  addEvent(workspaceId: string, caseId: string, event: CaseEvent): Promise<void>;

  getAnalysis(workspaceId: string, caseId: string): Promise<Analysis | null>;
  saveAnalysis(workspaceId: string, analysis: Analysis): Promise<void>;

  /** A shared cache across workspaces, such as a demo case's analysis or an embedding. */
  getCached<T>(key: string): Promise<T | null>;
  setCached<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /** Adds to a counter in a time window and returns the new total (rate limits, daily spend). */
  increment(key: string, by: number, windowSeconds: number): Promise<number>;
}
