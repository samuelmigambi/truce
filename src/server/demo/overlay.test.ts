import { describe, expect, it } from "vitest";
import type { Workspace } from "@/lib/domain";
import { approveCase } from "@/server/actions/approve";
import { playDueReactions } from "@/server/actions/reactions";
import { MemoryStore } from "@/server/store/memory";
import { SeededStore } from "./overlay";
import { loadPendingScans } from "./scans";
import { buildSeed, seedDemo, seedOf } from "./seed";

const created = "2026-10-28T15:20:00.000Z";
const seed = buildSeed(created);

const copy = (id: string): Workspace => ({
  id,
  kind: "demo",
  shopName: "Wick & Ember",
  createdAt: created,
  expiresAt: null,
  lastSweepAt: null,
  seedVersion: null,
});

async function setup() {
  const clock = { now: Date.parse(created) };
  const inner = new MemoryStore(() => clock.now);
  const store = new SeededStore(inner);
  const workspace = await seedDemo(store, copy("demo-overlay-tests-0001"), { fresh: true });
  return { inner, store, workspace, clock };
}

describe("demo copies worked out from the seed on read", () => {
  it("store only the workspace and its pending scans, yet read as the whole seed", async () => {
    const { inner, store, workspace } = await setup();
    expect(await inner.listOrders(workspace.id)).toEqual([]);
    expect(await inner.listCases(workspace.id)).toEqual([]);
    expect(await loadPendingScans(inner, workspace.id)).toEqual(seed.pendingScans);

    expect(await store.listOrders(workspace.id)).toEqual(seed.orders);
    expect(await store.listCases(workspace.id)).toEqual(seed.cases);
    expect(await store.getCase(workspace.id, "demo-inr-64")).toEqual(
      seed.cases.find((c) => c.id === "demo-inr-64"),
    );
    expect(await store.getOrder(workspace.id, "W-1102")).toMatchObject({
      note: expect.any(String),
    });
    expect(await store.listEvents(workspace.id, "demo-inr-64")).toEqual(seed.events["demo-inr-64"]);
    expect(await store.getCase(workspace.id, "nope")).toBeNull();
  });

  it("put stored changes in place of seeded records, and add new ones", async () => {
    const { store, workspace } = await setup();
    const kase = (await store.getCase(workspace.id, "demo-inr-86"))!;
    await store.saveCase(workspace.id, { ...kase, status: "waiting_buyer" });
    await store.saveOrder(workspace.id, { ...seed.orders[0]!, id: "W-1103" });
    await store.addEvent(workspace.id, "demo-inr-86", {
      id: "ev-1",
      at: "2026-10-28T16:00:00.000Z",
      kind: "approved",
      actor: "seller",
      title: "You approved the reply",
    });

    const cases = await store.listCases(workspace.id);
    expect(cases).toHaveLength(seed.cases.length);
    expect(cases.find((c) => c.id === "demo-inr-86")?.status).toBe("waiting_buyer");
    expect((await store.getCase(workspace.id, "demo-inr-86"))?.status).toBe("waiting_buyer");
    expect((await store.listOrders(workspace.id)).map((o) => o.id)).toContain("W-1103");
    expect((await store.listEvents(workspace.id, "demo-inr-86")).map((e) => e.id)).toEqual([
      "demo-inr-86-e1",
      "ev-1",
    ]);
  });

  it("never let a caller change the shared seed", async () => {
    const { store, workspace } = await setup();
    const orders = await store.listOrders(workspace.id);
    orders[0]!.amount = 1;
    (await store.getCase(workspace.id, "demo-inr-86"))!.status = "closed";
    expect(seedOf(created).orders[0]!.amount).not.toBe(1);
    expect((await store.getCase(workspace.id, "demo-inr-86"))!.status).toBe("needs_you");
  });

  it("start over on reset, dropping every stored change", async () => {
    const { inner, store, workspace } = await setup();
    await store.saveOrder(workspace.id, { ...seed.orders[0]!, id: "W-1103" });
    await store.saveAnalysis(workspace.id, {
      caseId: "demo-inr-86",
      steps: [],
      totalCost: 0,
    } as never);
    await seedDemo(store, workspace);
    expect(await inner.listOrders(workspace.id)).toEqual([]);
    expect(await store.listAnalyses(workspace.id)).toEqual([]);
    expect(await store.listOrders(workspace.id)).toHaveLength(seed.orders.length);
  });

  it("leave the live workspace and copies from an older seed as they are", async () => {
    const { store } = await setup();
    await store.saveWorkspace({ ...copy("live"), kind: "live", seedVersion: null });
    expect(await store.listOrders("live")).toEqual([]);
    await store.saveWorkspace({
      ...copy("demo-old-seed-00000001"),
      seedVersion: "wick-ember-0@2026-10-28",
    });
    expect(await store.listCases("demo-old-seed-00000001")).toEqual([]);
  });

  it("carry the whole story: approve, then the scripted reply closes the case", async () => {
    const { inner, store, workspace, clock } = await setup();
    await approveCase({
      store,
      workspace,
      caseId: "demo-inr-86",
      request: {
        move: "fight",
        draft: { kind: "message", text: "It was delivered.", evidenceIds: [] },
      },
      now: new Date(clock.now),
    });
    clock.now += 8_000;
    const [closed] = await playDueReactions(
      store,
      workspace.id,
      [(await store.getCase(workspace.id, "demo-inr-86"))!],
      new Date(clock.now),
    );
    expect(closed).toMatchObject({ outcome: "buyer_closed", moneyKept: 8600 });
    expect((await inner.listCases(workspace.id)).map((c) => c.id)).toEqual(["demo-inr-86"]);
    expect((await store.listEvents(workspace.id, "demo-inr-86")).map((e) => e.kind)).toEqual([
      "opened",
      "approved",
      "sent",
      "buyer_reply",
      "closed",
    ]);
  });
});
