import { describe, expect, it, vi } from "vitest";
import type { AnalysisEvent, SyncEvent } from "@/lib/api-types";
import type { Case } from "@/lib/domain";
import { connectPayPal } from "@/server/paypal/connection";
import { MemoryStore } from "@/server/store/memory";
import { testRealShop, testSampleShop, testUser } from "@/server/testing/shops";
import { mostUrgent, runShopSync } from "./sync-stream";

process.env.TRUCE_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");

async function collect(events: AsyncIterable<SyncEvent>) {
  const out: SyncEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

const analyzed = (caseId: string): AsyncIterable<AnalysisEvent> =>
  (async function* () {
    yield { type: "step", step: "triage", state: "start", label: "Reading the case" };
    yield { type: "result", analysis: { caseId } as never, replayed: false };
  })();

describe("choosing the case to analyze first", () => {
  it("takes the one that needs the seller soonest", () => {
    const c = (id: string, status: Case["status"], dueAt: string | null, amount = 100) =>
      ({ id, status, dueAt, amount }) as Case;
    expect(
      mostUrgent([
        c("closed", "closed", "2026-10-30T00:00:00Z"),
        c("waiting", "waiting_buyer", "2026-10-30T00:00:00Z"),
        c("later", "needs_you", "2026-11-09T00:00:00Z"),
        c("sooner", "needs_you", "2026-11-02T00:00:00Z"),
      ])?.id,
    ).toBe("sooner");
    expect(
      mostUrgent([c("a", "with_paypal", null, 50), c("b", "with_paypal", null, 120)])?.id,
    ).toBe("b");
    expect(mostUrgent([c("x", "closed", null)])).toBeNull();
  });
});

describe("a sample shop's first sync", () => {
  it("reports its data, analyzes the most urgent case, and makes the shop ready", async () => {
    const store = new MemoryStore();
    const owner = testUser("owner-1", {
      onboarding: { shopId: "sh_samplesync00001" },
    });
    await store.saveUser(owner);
    const shop = await testSampleShop(store, new Date().toISOString(), owner, "sh_samplesync00001");
    const inSetup = { ...shop, status: "setup" as const };
    await store.saveShop(inSetup);
    const events = await collect(
      runShopSync({ store, shop: inSetup, user: owner, analyze: (_s, id) => analyzed(id) }),
    );

    expect(events[0]).toMatchObject({ type: "step", step: "paypal", state: "skipped" });
    expect(events.filter((e) => e.type === "case")).toHaveLength(5);
    expect(events.filter((e) => e.type === "analysis")).toHaveLength(2);
    const done = events.at(-1);
    expect(done).toMatchObject({ type: "done", cases: 17, analyzedCaseId: "demo-inr-64" });
    expect((await store.getShop(shop.id))?.status).toBe("ready");
    expect(await store.getUser(owner.uid)).toMatchObject({
      lastShopId: shop.id,
      onboarding: { shopId: null },
    });
  });

  it("runs one sync per shop at a time", async () => {
    const store = new MemoryStore();
    const shop = await testSampleShop(store, new Date().toISOString());
    await store.increment(`sync-lock:${shop.id}`, 1, 600);
    const events = await collect(
      runShopSync({ store, shop, user: testUser(), analyze: (_s, id) => analyzed(id) }),
    );
    expect(events).toEqual([{ type: "error", message: expect.stringMatching(/already running/) }]);
  });
});

describe("a real shop's first sync", () => {
  it("brings in disputes from its PayPal app, notes what it can't read, and becomes ready", async () => {
    const store = new MemoryStore();
    const owner = testUser("owner-2");
    await store.saveUser(owner);
    const scopes = [
      "https://uri.paypal.com/services/disputes/read-seller",
      "https://uri.paypal.com/services/disputes/update-seller",
    ].join(" ");
    const dispute = {
      dispute_id: "PP-R-1",
      reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
      status: "WAITING_FOR_SELLER_RESPONSE",
      dispute_life_cycle_stage: "CHARGEBACK",
      dispute_amount: { currency_code: "USD", value: "40.00" },
      create_time: "2026-10-27T10:00:00Z",
      update_time: "2026-10-27T10:00:00Z",
      seller_response_due_date: "2026-11-06T04:59:59Z",
      disputed_transactions: [{ seller_transaction_id: "CAP1", buyer: { name: "Lee Park" } }],
    };
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/v1/oauth2/token"))
        return Response.json({ access_token: "t", expires_in: 32400, scope: scopes });
      if (url.includes("/v1/customer/disputes?")) return Response.json({ items: [dispute] });
      if (url.endsWith("/v1/customer/disputes/PP-R-1")) return Response.json(dispute);
      return Response.json({ name: "RESOURCE_NOT_FOUND" }, { status: 404 });
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchImpl);
    try {
      const draft = testRealShop(owner, { status: "setup", setupStep: "paypal", paypal: null });
      const connected = (
        await connectPayPal({
          store,
          shop: draft,
          request: {
            environment: "sandbox",
            clientId: "AYclient0123456789abcdefghij",
            clientSecret: "EKsecret0123456789abcdefghij",
          },
          siteUrl: null,
        })
      ).shop;
      const reviewed = { ...connected, setupStep: "review" as const };
      await store.saveShop(reviewed);
      const events = await collect(
        runShopSync({ store, shop: reviewed, user: owner, analyze: (_s, id) => analyzed(id) }),
      );
      const steps = events
        .filter((e) => e.type === "step")
        .map((e) => `${(e as { step: string }).step}:${(e as { state: string }).state}`);
      expect(steps).toEqual([
        "paypal:start",
        "paypal:done",
        "disputes:start",
        "disputes:done",
        "orders:start",
        "orders:done",
        "history:start",
        "history:skipped",
        "sort:done",
        "analysis:start",
        "analysis:done",
      ]);
      expect(events.find((e) => e.type === "case")).toMatchObject({
        caseId: "PP-R-1",
        buyer: "Lee Park",
        amount: 4000,
      });
      expect(events.at(-1)).toMatchObject({ type: "done", cases: 1, analyzedCaseId: "PP-R-1" });
      expect((await store.getShop(reviewed.id))?.status).toBe("ready");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
