import { describe, expect, it, vi } from "vitest";
import { MemoryStore } from "@/server/store/memory";
import { testRealShop } from "@/server/testing/shops";
import {
  checkPayPal,
  clientIdHash,
  connectPayPal,
  featuresFromScopes,
  paypalFor,
  SCOPES,
  shortClientId,
  webhookTarget,
} from "./connection";

process.env.TRUCE_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");

const ALL = Object.values(SCOPES).join(" ");
const request = {
  environment: "sandbox" as const,
  clientId: "AYclientid0123456789abcdefghijklmnop",
  clientSecret: "EKsecret0123456789abcdefghijklmnop",
};

/** PayPal by URL; anything unexpected fails the test. */
function fakePayPal(routes: Record<string, (init?: RequestInit) => Response>) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input).replace(/^https:\/\/api-m\.(sandbox\.)?paypal\.com/, "");
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const route = Object.keys(routes).find((key) =>
      `${init?.method ?? "GET"} ${url}`.startsWith(key),
    );
    if (!route) throw new Error(`Unexpected call to ${url}`);
    return routes[route]!(init);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const token =
  (scope = ALL) =>
  () =>
    Response.json({ access_token: "t", expires_in: 32400, scope, app_id: "APP-9" });
const draft = () => testRealShop(undefined, { status: "setup", setupStep: "paypal", paypal: null });

describe("reading an app's features", () => {
  it("from its token's scopes", () => {
    expect(featuresFromScopes(ALL.split(" "))).toEqual({
      disputes: true,
      respond: true,
      transactions: true,
      tracking: true,
      webhooks: true,
    });
    expect(featuresFromScopes(["openid"])).toEqual({
      disputes: false,
      respond: false,
      transactions: false,
      tracking: false,
      webhooks: false,
    });
  });

  it("shortens client IDs and hashes them the same way every time", () => {
    expect(shortClientId("AYclientid0123456789xyz")).toBe("AYcl…xyz");
    expect(clientIdHash(" abc ")).toBe(clientIdHash("abc"));
    expect(clientIdHash("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("only points webhooks at a public https site", () => {
    expect(webhookTarget("sh_1", "http://localhost:3100")).toHaveProperty("skip");
    expect(webhookTarget("sh_1", "http://truce.example.com")).toHaveProperty("skip");
    expect(webhookTarget("sh_1", "https://truce.example.com/anything")).toEqual({
      url: "https://truce.example.com/api/paypal/webhook/sh_1",
    });
  });
});

describe("connecting a shop's PayPal app", () => {
  it("reuses a webhook already registered for the same address", async () => {
    const store = new MemoryStore();
    const shop = draft();
    const { fetchImpl, calls } = fakePayPal({
      "POST /v1/oauth2/token": token(),
      "POST /v1/notifications/webhooks": () =>
        Response.json({ name: "WEBHOOK_URL_ALREADY_EXISTS", message: "exists" }, { status: 400 }),
      "GET /v1/notifications/webhooks": () =>
        Response.json({
          webhooks: [
            { id: "WH-OLD", url: `https://truce.example.com/api/paypal/webhook/${shop.id}` },
          ],
        }),
    });
    const result = await connectPayPal({
      store,
      shop,
      request,
      fetchImpl,
      siteUrl: "https://truce.example.com",
    });
    expect(result.shop.paypal?.webhook).toMatchObject({ status: "registered", id: "WH-OLD" });
    expect(result.shop.orderHistory).toBe("full");
    expect(calls).toContain("GET /v1/notifications/webhooks");
  });

  it("takes the webhook off the old app when a different app replaces it", async () => {
    const store = new MemoryStore();
    const first = fakePayPal({
      "POST /v1/oauth2/token": token(),
      "POST /v1/notifications/webhooks": () => Response.json({ id: "WH-A" }),
    });
    const connected = (
      await connectPayPal({
        store,
        shop: draft(),
        request,
        fetchImpl: first.fetchImpl,
        siteUrl: "https://truce.example.com",
      })
    ).shop;
    const second = fakePayPal({
      "POST /v1/oauth2/token": token(),
      "DELETE /v1/notifications/webhooks/WH-A": () => new Response(null, { status: 204 }),
      "POST /v1/notifications/webhooks": () => Response.json({ id: "WH-B" }),
    });
    const replaced = await connectPayPal({
      store,
      shop: connected,
      request: { ...request, clientId: "AYanotherclient0123456789abcdefghij" },
      fetchImpl: second.fetchImpl,
      siteUrl: "https://truce.example.com",
    });
    expect(second.calls).toContain("DELETE /v1/notifications/webhooks/WH-A");
    expect(replaced.shop.paypal).toMatchObject({
      webhook: { id: "WH-B" },
      clientIdHash: clientIdHash("AYanotherclient0123456789abcdefghij"),
    });
  });

  it("refuses a sample shop, and a server without its encryption key", async () => {
    const store = new MemoryStore();
    await expect(
      connectPayPal({
        store,
        shop: { ...draft(), kind: "sample" },
        request,
        fetchImpl: fakePayPal({}).fetchImpl,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const saved = process.env.TRUCE_ENCRYPTION_KEY;
    delete process.env.TRUCE_ENCRYPTION_KEY;
    try {
      await expect(
        connectPayPal({ store, shop: draft(), request, fetchImpl: fakePayPal({}).fetchImpl }),
      ).rejects.toMatchObject({ status: 503, code: "encryption_unavailable" });
    } finally {
      process.env.TRUCE_ENCRYPTION_KEY = saved;
    }
  });

  it("opens the sealed keys for the shop's own clients", async () => {
    const store = new MemoryStore();
    const { fetchImpl } = fakePayPal({ "POST /v1/oauth2/token": token() });
    const { shop } = await connectPayPal({
      store,
      shop: draft(),
      request,
      fetchImpl,
      siteUrl: null,
    });
    const later = fakePayPal({
      "POST /v1/oauth2/token": token(),
      "GET /v1/customer/disputes/X": () => Response.json({ dispute_id: "X" }),
    });
    const clients = await paypalFor(store, shop, later.fetchImpl);
    expect(await clients!.client.getDispute("X")).toEqual({ dispute_id: "X" });
    // The token request carried the sealed secret, opened, as Basic auth.
    const basic = (later.fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]![1].headers as Record<string, string>;
    expect(Buffer.from(basic.Authorization!.slice(6), "base64").toString()).toBe(
      `${request.clientId}:${request.clientSecret}`,
    );
    expect(await paypalFor(store, { ...shop, kind: "sample" })).toBeNull();
  });

  it("says when the account's other shop is on the same app, and never names someone else's", async () => {
    const store = new MemoryStore();
    const { fetchImpl } = fakePayPal({ "POST /v1/oauth2/token": token() });
    const first = { ...draft(), id: "sh_firstshop0000001", name: "First Shop" };
    await connectPayPal({ store, shop: first, request, fetchImpl, siteUrl: null });
    const stranger = {
      ...draft(),
      id: "sh_strangershop0001",
      name: "Stranger Shop",
      ownerUid: "someone-else",
      memberIds: ["someone-else"],
    };
    await connectPayPal({ store, shop: stranger, request, fetchImpl, siteUrl: null });
    const second = { ...draft(), id: "sh_secondshop000001", name: "Second Shop" };
    const { notes } = await connectPayPal({
      store,
      shop: second,
      request,
      fetchImpl,
      siteUrl: null,
    });
    expect(notes.join(" ")).toMatch(/also connected to First Shop\./);
    expect(notes.join(" ")).not.toMatch(/Stranger Shop/);
  });

  it("records a problem when PayPal stops accepting the keys", async () => {
    const store = new MemoryStore();
    const { fetchImpl } = fakePayPal({ "POST /v1/oauth2/token": token() });
    const { shop } = await connectPayPal({
      store,
      shop: draft(),
      request,
      fetchImpl,
      siteUrl: null,
    });
    const refused = fakePayPal({
      "POST /v1/oauth2/token": () => Response.json({ error: "invalid_client" }, { status: 401 }),
    });
    const checked = await checkPayPal(store, shop, refused.fetchImpl, null);
    expect(checked.shop.paypal).toMatchObject({
      health: "error",
      problem: expect.stringMatching(/reconnect PayPal/),
    });
  });
});
