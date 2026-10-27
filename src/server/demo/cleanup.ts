import "server-only";

import { getStore, type Store } from "@/server/store";
import { isBulk } from "@/server/store/bulk";
import { pendingScansKey } from "./scans";

/**
 * Deletes demo copies whose week is up: the workspace with its orders, cases, events and
 * analyses, and its cached scans. A visitor who comes back later simply gets a fresh copy. Meant
 * for the overnight job; the live workspace never expires, so it's never touched.
 */
export async function deleteExpiredDemoCopies(
  store: Store = getStore(),
  now = new Date(),
  limit = 200,
): Promise<{ deleted: string[] }> {
  if (!isBulk(store)) return { deleted: [] };
  const expired = (await store.expiredWorkspaces(now, limit)).filter((id) =>
    id.startsWith("demo-"),
  );
  const deleted: string[] = [];
  // A few at a time: each is a recursive delete of a few hundred documents.
  for (let i = 0; i < expired.length; i += 5) {
    const group = expired.slice(i, i + 5);
    await Promise.all(group.map((id) => store.deleteWorkspace(id, [pendingScansKey(id)])));
    deleted.push(...group);
  }
  return { deleted };
}
