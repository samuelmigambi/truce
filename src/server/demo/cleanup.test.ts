import { describe, expect, it } from "vitest";
import { loadPendingScans } from "./scans";
import { MemoryStore } from "@/server/store/memory";
import { deleteExpiredDemoCopies } from "./cleanup";
import { seedDemo } from "./seed";

const copy = (id: string, createdAt: string, expiresAt: string | null) => ({
  id,
  kind: "demo" as const,
  shopName: "Wick & Ember",
  createdAt,
  expiresAt,
  lastSweepAt: null,
  seedVersion: null,
});

describe("deleteExpiredDemoCopies", () => {
  it("deletes demo copies whose week is up, with everything in them, and nothing else", async () => {
    const store = new MemoryStore();
    const old = await seedDemo(
      store,
      copy("demo-expired-0000000001", "2026-10-01T10:00:00.000Z", "2026-10-08T10:00:00.000Z"),
    );
    const recent = await seedDemo(
      store,
      copy("demo-current-0000000001", "2026-10-27T10:00:00.000Z", "2026-11-03T10:00:00.000Z"),
    );
    await store.saveWorkspace({ ...copy("live", "2026-10-01T10:00:00.000Z", null), kind: "live" });

    const result = await deleteExpiredDemoCopies(store, new Date("2026-10-28T00:00:00.000Z"));
    expect(result.deleted).toEqual([old.id]);
    expect(await store.getWorkspace(old.id)).toBeNull();
    expect(await store.listOrders(old.id)).toEqual([]);
    expect(await store.listEvents(old.id, "demo-inr-64")).toEqual([]);
    expect(await loadPendingScans(store, old.id)).toEqual({});

    expect(await store.getWorkspace(recent.id)).not.toBeNull();
    expect(await store.listCases(recent.id)).toHaveLength(17);
    expect(await store.getWorkspace("live")).not.toBeNull();
  });

  it("does nothing when nothing has expired", async () => {
    expect(await deleteExpiredDemoCopies(new MemoryStore())).toEqual({ deleted: [] });
  });
});
