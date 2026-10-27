import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}));

const { PayPal } = await import("@/server/paypal/client");
const { MemoryStore } = await import("@/server/store/memory");
const { seedDemo } = await import("@/server/demo/seed");
const { captureShopOrder, createShopOrder, nextDemoNumber, priceCart } = await import("./shop");

const config = { clientId: "id", clientSecret: "secret", base: "https://api-m.sandbox.paypal.com" };
const ok = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fakePayPal(answer: () => Response) {
  const calls: { url: string; body: string; headers: Record<string, string> }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("/v1/oauth2/token"))
      return ok(200, { access_token: "t", expires_in: 32400 });
    calls.push({
      url: String(url).replace(config.base, ""),
      body: String(init?.body),
      headers: init?.headers as Record<string, string>,
    });
    return answer();
  }) as unknown as typeof fetch;
  return { paypal: new PayPal(config, fetchImpl), calls };
}

const captured = {
  id: "8FB273900B176105E",
  status: "COMPLETED",
  payer: {
    email_address: "sb-buyer@personal.example.com",
    name: { given_name: "John", surname: "Doe" },
  },
  purchase_units: [
    {
      custom_id: "W-1045",
      shipping: {
        name: { full_name: "John Doe" },
        address: {
          address_line_1: "2211 N First St",
          admin_area_2: "San Jose",
          admin_area_1: "CA",
          postal_code: "95131",
          country_code: "US",
        },
      },
      payments: {
        captures: [
          {
            id: "9D810630R46435349",
            status: "COMPLETED",
            amount: { currency_code: "USD", value: "106.00" },
            seller_protection: {
              status: "ELIGIBLE",
              dispute_categories: ["ITEM_NOT_RECEIVED", "UNAUTHORIZED_TRANSACTION"],
            },
          },
        ],
      },
    },
  ],
};

let store: InstanceType<typeof MemoryStore>;
beforeEach(() => {
  store = new MemoryStore();
});

describe("pricing a cart", () => {
  it("prices from the catalog and merges repeated lines", () => {
    expect(
      priceCart([
        { productId: "p-fig-linen", quantity: 1 },
        { productId: "p-cedar-smoke-trio", quantity: 1 },
        { productId: "p-fig-linen", quantity: 1 },
      ]),
    ).toEqual({
      items: [
        { productId: "p-fig-linen", name: "Fig & Linen", quantity: 2, unitPrice: 3200 },
        {
          productId: "p-cedar-smoke-trio",
          name: "Cedar & Smoke candle trio",
          quantity: 1,
          unitPrice: 8600,
        },
      ],
      amount: 15000,
    });
  });

  it("refuses unknown products and empty carts", () => {
    expect(() => priceCart([{ productId: "p-free-candle", quantity: 1 }])).toThrow(
      /isn't in the shop/,
    );
    expect(() => priceCart([])).toThrow(/empty/);
    expect(() => priceCart([{ productId: "p-fig-linen", quantity: 11 }])).toThrow(/Ten of each/);
  });
});

describe("checkout", () => {
  it("creates the PayPal order with the shop's number and the server's prices", async () => {
    const { paypal, calls } = fakePayPal(() =>
      ok(201, { id: "8FB273900B176105E", status: "CREATED" }),
    );
    const result = await createShopOrder({
      store,
      paypal,
      lines: [
        { productId: "p-amber-glow-pillar", quantity: 1 },
        { productId: "p-honey-tobacco", quantity: 2 },
      ],
      requestId: "req-1",
    });
    expect(result).toEqual({ id: "8FB273900B176105E", orderId: "W-1045" });
    expect(calls[0]!.url).toBe("/v2/checkout/orders");
    expect(calls[0]!.headers["PayPal-Request-Id"]).toBe("req-1");
    const body = JSON.parse(calls[0]!.body);
    expect(body.purchase_units[0]).toMatchObject({
      custom_id: "W-1045",
      amount: {
        currency_code: "USD",
        value: "106.00",
        breakdown: { item_total: { value: "106.00" } },
      },
    });
    expect(body.purchase_units[0].items).toHaveLength(2);

    const next = fakePayPal(() => ok(201, { id: "OTHER0000000000AB" }));
    expect(
      (
        await createShopOrder({
          store,
          paypal: next.paypal,
          lines: [{ productId: "p-fig-linen", quantity: 1 }],
          requestId: "req-2",
        })
      ).orderId,
    ).toBe("W-1046");
  });

  it("says so when PayPal isn't connected", async () => {
    await expect(
      createShopOrder({
        store,
        paypal: null,
        lines: [{ productId: "p-fig-linen", quantity: 1 }],
        requestId: "r",
      }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("captures, then saves the order to the live workspace and the visitor's demo copy", async () => {
    const created = fakePayPal(() => ok(201, { id: "8FB273900B176105E" }));
    await createShopOrder({
      store,
      paypal: created.paypal,
      lines: [
        { productId: "p-amber-glow-pillar", quantity: 1 },
        { productId: "p-honey-tobacco", quantity: 2 },
      ],
      requestId: "r",
    });
    const visitor = await seedDemo(store, {
      id: "demo-shop-tests-000001",
      kind: "demo",
      shopName: "Wick & Ember",
      createdAt: "2026-10-28T15:20:00.000Z",
      expiresAt: null,
      lastSweepAt: null,
      seedVersion: null,
    });
    const { paypal, calls } = fakePayPal(() => ok(201, captured));
    const result = await captureShopOrder({
      store,
      paypal,
      paypalOrderId: "8FB273900B176105E",
      visitor,
    });
    expect(calls[0]!.url).toBe("/v2/checkout/orders/8FB273900B176105E/capture");
    expect(calls[0]!.headers["PayPal-Request-Id"]).toBe("capture-8FB273900B176105E");
    expect(result).toEqual({
      orderId: "W-1103",
      liveOrderId: "W-1045",
      status: "COMPLETED",
      amount: 10600,
    });

    const liveOrder = (await store.getOrder("live", "W-1045"))!;
    expect(liveOrder).toMatchObject({
      paypalOrderId: "8FB273900B176105E",
      captureId: "9D810630R46435349",
      buyer: { name: "John Doe", email: "sb-buyer@personal.example.com" },
      status: "paid",
      protection: "ELIGIBLE",
      paypalAddress: { line1: "2211 N First St", city: "San Jose" },
      tracking: null,
    });
    expect(liveOrder.items.map((i) => [i.productId, i.quantity])).toEqual([
      ["p-amber-glow-pillar", 1],
      ["p-honey-tobacco", 2],
    ]);
    expect(await store.getWorkspace("live")).toMatchObject({ kind: "live" });
    expect((await store.getOrder(visitor.id, "W-1103"))!.captureId).toBe("9D810630R46435349");

    // A retried capture lands on the same order, not a new one.
    const again = await captureShopOrder({
      store,
      paypal,
      paypalOrderId: "8FB273900B176105E",
      visitor,
    });
    expect(again.orderId).toBe("W-1103");
  });

  it("turns PayPal's declines into plain messages", async () => {
    const { paypal } = fakePayPal(() =>
      ok(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "INSTRUMENT_DECLINED" }] }),
    );
    await expect(
      captureShopOrder({ store, paypal, paypalOrderId: "8FB273900B176105E", visitor: null }),
    ).rejects.toMatchObject({
      status: 402,
      message: "PayPal declined that payment. Try another way to pay.",
    });
  });

  it("numbers a demo copy's new orders after its newest", () => {
    expect(nextDemoNumber([{ id: "W-1102" }, { id: "W-1103" }, { id: "W-877" }] as never)).toBe(
      "W-1104",
    );
    expect(nextDemoNumber([])).toBe("W-1103");
  });
});
