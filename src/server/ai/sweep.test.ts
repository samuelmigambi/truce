import { describe, expect, it } from "vitest";
import type { AnalysisEvent, SweepEvent } from "@/lib/api-types";
import type { Shop } from "@/lib/domain";
import { runSweep, type SweepDeps } from "./sweep";
import { fakeAi, fakeBudget, lastText, memoryStore, systemText } from "./testing/fakes";
import { realShop, seeded } from "./testing/fixtures";

const MODELS = {
  fast: "nvidia/Nemotron-3_5-Lightning",
  draft: "nvidia/Nemotron-3.5-Super-VL",
  decide: "nvidia/Nemotron-3-Ultra-550b-a55b",
  embed: "Qwen/Qwen3-Embedding-8B",
};

async function setup(shop?: Shop) {
  const store = memoryStore();
  const w = await seeded(store, 0, shop);
  const ai = fakeAi({
    json: {
      record_triage: (body) => ({
        summary: `Summary of ${lastText(body).match(/Buyer: (.+)/)?.[1]}.`,
        buyerWants: "refund",
        injection: false,
      }),
    },
  });
  const budget = fakeBudget();
  const deps = (extra: Partial<SweepDeps> = {}): SweepDeps => ({
    store,
    client: ai.client,
    shop: w.shop,
    budget,
    models: MODELS,
    now: () => w.now,
    ...extra,
  });
  return { store, w, ai, budget, deps };
}

async function collect(events: AsyncIterable<SweepEvent>) {
  const out: SweepEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

describe("runSweep", () => {
  it("sorts the unread cases with Lightning, checks orders to ship, and records the sweep", async () => {
    const { deps, store, w, ai, budget } = await setup();
    const events = await collect(runSweep(deps()));
    const cases = events.filter((e) => e.type === "case");
    expect(cases.map((e) => (e.type === "case" ? e.caseId : ""))).toEqual([
      "demo-inr-86",
      "demo-nad-42",
      "demo-damaged-28",
      "demo-inr-64",
    ]);
    expect(cases[0]).toMatchObject({ summary: "Summary of Sam Rivera." });
    expect(events.filter((e) => e.type === "order")).toEqual([
      {
        type: "order",
        orderId: "W-1101",
        ok: true,
        label: "Ready to ship: the label matches PayPal's address",
      },
      {
        type: "order",
        orderId: "W-1102",
        ok: false,
        label: expect.stringMatching(
          /differs from PayPal's.*drafted a note asking the buyer to update it in PayPal/,
        ),
      },
    ]);
    expect(events.at(-1)).toEqual({ type: "done", analyzed: 4, flagged: 1 });
    expect(events[0]).toMatchObject({
      type: "progress",
      label: "Sorting 4 open cases Truce hasn't read",
      total: 4,
    });
    expect(events.filter((e) => e.type === "usage")).toHaveLength(4);
    expect(budget.spent).toBeGreaterThan(0);
    expect(
      ai.requests.every(
        (r) => r.model === MODELS.fast && r.chat_template_kwargs?.enable_thinking === false,
      ),
    ).toBe(true);
    expect((await store.getShop(w.shop.id))?.lastSweepAt).toBe(w.now.toISOString());
    expect((await store.listEvents(w.shop.id, "demo-inr-86")).at(-1)).toMatchObject({
      kind: "note",
      actor: "truce",
      detail: "Summary of Sam Rivera.",
    });
  });

  it("reuses an earlier sort of the same facts, without a model call or a second note", async () => {
    const { deps, store, w, ai } = await setup();
    await collect(runSweep(deps()));
    const calls = ai.requests.length;
    const again = await collect(runSweep(deps()));
    expect(ai.requests.length).toBe(calls);
    expect(again.filter((e) => e.type === "case")).toHaveLength(4);
    expect(again.filter((e) => e.type === "usage")).toHaveLength(0);
    expect(
      (await store.listEvents(w.shop.id, "demo-inr-86")).filter((e) => e.kind === "note"),
    ).toHaveLength(1);
  });

  it("syncs from PayPal first, and keeps going if PayPal is down", async () => {
    const { deps } = await setup();
    const ok = await collect(
      runSweep(deps({ sync: async () => ({ label: "2 disputes updated from PayPal" }) })),
    );
    expect(ok.slice(0, 2)).toEqual([
      { type: "progress", label: "Checking PayPal for new disputes", done: 0, total: 1 },
      { type: "progress", label: "2 disputes updated from PayPal", done: 1, total: 1 },
    ]);
    const down = await collect(
      runSweep(
        deps({
          sync: async () => {
            throw new Error("503");
          },
        }),
      ),
    );
    expect(down[1]).toMatchObject({
      type: "error",
      message: expect.stringMatching(/Couldn't reach PayPal/),
    });
    expect(down.at(-1)).toMatchObject({ type: "done" });
  });

  it("prepares full analyses when the overnight job asks for them", async () => {
    const { deps } = await setup();
    const analyzed: string[] = [];
    const analyze = async function* (caseId: string): AsyncGenerator<AnalysisEvent> {
      analyzed.push(caseId);
      yield {
        type: "usage",
        step: "decide",
        model: MODELS.decide,
        input: 1,
        output: 1,
        cached: 0,
        cost: 0.004,
      };
    };
    const events = await collect(runSweep(deps({ analyze })));
    expect(analyzed).toHaveLength(4);
    expect(events.filter((e) => e.type === "usage" && e.model === MODELS.decide)).toHaveLength(4);
  });

  it("runs on the rules alone past the spend cap", async () => {
    const { deps, ai } = await setup();
    const events = await collect(runSweep({ ...deps(), budget: fakeBudget({ spentAlready: 9 }) }));
    expect(events[0]).toMatchObject({
      type: "error",
      message: expect.stringMatching(/tracking and deadlines only/),
    });
    expect(ai.requests).toHaveLength(0);
    expect(events.filter((e) => e.type === "case")[0]).toMatchObject({
      summary: expect.stringMatching(/^Sam Rivera opened an inquiry for item not received/),
    });
    expect(events.at(-1)).toEqual({ type: "done", analyzed: 4, flagged: 1 });
  });
});

describe("runSweep, in a real shop", () => {
  it("counts against the shop's own limit, reads it on its calendar and saves the sweep on it", async () => {
    const { deps, store, w, ai, budget } = await setup(realShop());
    const events = await collect(runSweep(deps()));
    expect(events.at(-1)).toEqual({ type: "done", analyzed: 4, flagged: 1 });
    expect(budget.rateKeys).toEqual(["sweep:sh_saltbushcandle01"]);
    expect(systemText(ai.requests[0]!)).toContain("Today is Oct 29, 2026 in the shop's time zone.");
    expect(ai.requests.every((r) => /Amount in dispute: A\$\d+/.test(lastText(r)))).toBe(true);
    expect((await store.getShop(w.shop.id))?.lastSweepAt).toBe(w.now.toISOString());
    expect((await store.getShop(w.shop.id))?.name).toBe("Saltbush Candle Co.");
  });

  it("writes the rules-only summary in the shop's money, on its calendar", async () => {
    const { deps } = await setup(realShop());
    const events = await collect(runSweep({ ...deps(), budget: fakeBudget({ spentAlready: 9 }) }));
    expect(events.find((e) => e.type === "case" && e.caseId === "demo-inr-86")).toEqual({
      type: "case",
      caseId: "demo-inr-86",
      summary:
        "Sam Rivera opened an inquiry for item not received on Cedar & Smoke candle trio (A$86) on Oct 27, 2026. USPS shows it delivered Oct 25, 2026. The response is due Nov 6, 2026.",
    });
  });

  it("sorts a case again when the shop's currency changes", async () => {
    const { deps, ai } = await setup(realShop());
    await collect(runSweep(deps()));
    const calls = ai.requests.length;
    await collect(runSweep(deps({ shop: realShop({ currency: "USD" }) })));
    expect(ai.requests.length).toBe(calls * 2);
  });
});
