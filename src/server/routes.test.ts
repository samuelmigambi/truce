import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The backend's route handlers, called directly with a fake cookie jar standing in for
 * next/headers. Demo copies use the memory store; PayPal isn't connected.
 */

const jar = new Map<string, string>();
const requestHeaders = new Headers({ "x-forwarded-for": "198.51.100.7" });
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
  headers: async () => requestHeaders,
}));

for (const key of [
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
  "NEBIUS_API_KEY",
  "TAVILY_API_KEY",
]) {
  delete process.env[key];
}
process.env.TRUCE_STORE = "memory";
process.env.TRUCE_OWNER_KEY = "owner-key-for-route-tests";

const { memoryStore } = await import("./store/memory");
const session = await import("@/app/api/session/route");
const reset = await import("@/app/api/session/reset/route");
const cases = await import("@/app/api/cases/route");
const oneCase = await import("@/app/api/cases/[id]/route");
const approve = await import("@/app/api/cases/[id]/approve/route");
const orders = await import("@/app/api/orders/route");
const tracking = await import("@/app/api/orders/[id]/tracking/route");
const metrics = await import("@/app/api/metrics/route");
const status = await import("@/app/api/status/route");
const health = await import("@/app/api/health/route");
const shopConfig = await import("@/app/api/shop/config/route");
const shopOrders = await import("@/app/api/shop/orders/route");
const capture = await import("@/app/api/shop/orders/[id]/capture/route");
const webhook = await import("@/app/api/paypal/webhook/route");
const owner = await import("@/app/api/owner/route");

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (url: string, body: unknown) =>
  new Request(`http://localhost:3100${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(() => memoryStore().reset());
beforeEach(() => jar.clear());

describe("session routes", () => {
  it("make a demo copy on the first visit, then reset it", async () => {
    const first = await (await session.GET()).json();
    expect(first.workspace).toMatchObject({ kind: "demo", shopName: "Wick & Ember" });
    expect(jar.get("truce_ws")).toBe(first.workspace.id);

    const again = await (await session.GET()).json();
    expect(again.workspace.id).toBe(first.workspace.id);

    const response = await reset.POST();
    expect(response.status).toBe(200);
    expect((await response.json()).workspace.id).toBe(first.workspace.id);
  });
});

describe("case routes", () => {
  it("list the inbox: open cases by deadline, then closed ones", async () => {
    const body = await (await cases.GET()).json();
    expect(body.cases).toHaveLength(17);
    expect(body.cases.slice(0, 5).map((c: { id: string }) => c.id)).toEqual([
      "demo-inr-64",
      "demo-unauth-120",
      "demo-inr-86",
      "demo-nad-42",
      "demo-damaged-28",
    ]);
    expect(body.cases[0]).toMatchObject({ recommendation: null, analyzed: false });
    expect(body.cases.slice(5).every((c: { status: string }) => c.status === "closed")).toBe(true);
  });

  it("open one case with its order and events, or say it isn't there", async () => {
    const body = await (
      await oneCase.GET(
        new Request("http://localhost/api/cases/demo-inr-64"),
        params("demo-inr-64"),
      )
    ).json();
    expect(body.case.id).toBe("demo-inr-64");
    expect(body.order.items[0]).toMatchObject({ productId: "p-honey-tobacco", quantity: 2 });
    expect(body.events.map((e: { kind: string }) => e.kind)).toEqual([
      "opened",
      "message",
      "escalated",
      "note",
    ]);
    expect(body.analysis).toBeNull();

    const missing = await oneCase.GET(
      new Request("http://localhost/api/cases/nope"),
      params("nope"),
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "There's no case with that ID here." });
  });

  it("approve a step after checking the body", async () => {
    const bad = await approve.POST(
      post("/api/cases/demo-inr-86/approve", { move: "surrender" }),
      params("demo-inr-86"),
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/^move: /);

    const empty = await approve.POST(
      post("/api/cases/demo-inr-86/approve", {
        move: "fight",
        draft: { kind: "message", text: "   ", evidenceIds: [] },
      }),
      params("demo-inr-86"),
    );
    expect(await empty.json()).toEqual({
      error: "draft.text: The draft is empty. Write what to send first.",
    });

    const ok = await approve.POST(
      post("/api/cases/demo-inr-86/approve", {
        move: "fight",
        draft: { kind: "message", text: "It was delivered.", evidenceIds: ["E2"] },
      }),
      params("demo-inr-86"),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ simulated: true, case: { status: "waiting_buyer" } });
  });
});

describe("order routes", () => {
  it("list orders with checks, those waiting to ship first", async () => {
    const body = await (await orders.GET()).json();
    expect(body.orders.slice(0, 2).map((o: { id: string }) => o.id)).toEqual(["W-1102", "W-1101"]);
    expect(body.orders[0].checks.covered).toBe(false);
    expect(body.orders[1].checks.covered).toBe(true);
    expect(body.orders.filter((o: { caseId: string | null }) => o.caseId).length).toBe(17);
  });

  it("add tracking, after checking the number", async () => {
    const bad = await tracking.POST(
      post("/api/orders/W-1101/tracking", { carrier: "USPS", number: "x" }),
      params("W-1101"),
    );
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({
      error: "number: That doesn't look like a tracking number.",
    });
    const ok = await tracking.POST(
      post("/api/orders/W-1101/tracking", {
        carrier: "USPS",
        number: "9400 1118 9922 3346 1234 56",
      }),
      params("W-1101"),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      simulated: true,
      order: { id: "W-1101", status: "label_created" },
    });
  });
});

describe("reading routes", () => {
  it("compute the dashboard", async () => {
    const body = await (await metrics.GET()).json();
    expect(body).toMatchObject({ openCases: 5, ratio: { claims: 2 } });
    expect(body.weekly).toHaveLength(13);
  });

  it("report connections without keys, and health", async () => {
    expect(await (await status.GET()).json()).toMatchObject({
      paypal: false,
      tokenFactory: false,
      tavily: false,
      store: "memory",
      models: {
        fast: expect.any(String),
        draft: expect.any(String),
        decide: expect.any(String),
        embed: expect.any(String),
      },
    });
    expect(await (await health.GET()).json()).toMatchObject({ ok: true, store: "memory" });
  });
});

describe("shop routes", () => {
  it("serve no client ID and refuse checkout when PayPal isn't connected", async () => {
    expect(await (await shopConfig.GET()).json()).toEqual({ clientId: null });
    const created = await shopOrders.POST(
      post("/api/shop/orders", { items: [{ productId: "p-fig-linen", quantity: 1 }] }),
    );
    expect(created.status).toBe(503);
    const empty = await shopOrders.POST(post("/api/shop/orders", { items: [] }));
    expect(await empty.json()).toEqual({ error: "items: The cart is empty." });
    const bad = await capture.POST(post("/api/shop/orders/x/capture", {}), params("not an id"));
    expect(bad.status).toBe(400);
  });

  it("turn webhooks away until PayPal is set up", async () => {
    expect((await webhook.POST(post("/api/paypal/webhook", {}))).status).toBe(503);
  });
});

describe("owner sign-in", () => {
  it("signs in only with the right key, posted in the body, and back out", async () => {
    const wrong = await owner.POST(post("/api/owner", { key: "nope" }));
    expect(wrong.status).toBe(403);
    expect(await wrong.json()).toEqual({ error: "That key didn't match." });
    expect(jar.size).toBe(0);
    expect((await owner.POST(post("/api/owner", {}))).status).toBe(400);

    const right = await owner.POST(post("/api/owner", { key: "owner-key-for-route-tests" }));
    expect(right.status).toBe(204);
    expect(jar.get("truce_ws")).toBe("live");

    const live = await (await session.GET()).json();
    expect(live.workspace).toMatchObject({ id: "live", kind: "live" });
    expect((await reset.POST()).status).toBe(400);

    expect((await owner.DELETE()).status).toBe(204);
    expect(jar.size).toBe(0);
  });

  it("limits tries per network", async () => {
    let last = 0;
    for (let i = 0; i < 12; i++)
      last = (await owner.POST(post("/api/owner", { key: "guess" }))).status;
    expect(last).toBe(429);
  });
});
