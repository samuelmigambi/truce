import { describe, expect, it, vi } from "vitest";
import type { Order } from "@/lib/domain";
import { catchUpScans, loadPendingScans } from "@/server/demo/scans";
import { testConnection, testRealShop, testSampleShop } from "@/server/testing/shops";
import { PayPal } from "@/server/paypal/client";
import { MemoryStore } from "@/server/store/memory";
import { addTracking, normalizeTrackingNumber, sortOrders, withChecks } from "./tracking";

const DAY = 24 * 60 * 60 * 1000;
const created = "2026-10-28T15:20:00.000Z";

async function sampleCopy() {
  const clock = { now: Date.parse(created) };
  const store = new MemoryStore(() => clock.now);
  const shop = await testSampleShop(store, created);
  return { store, shop, clock };
}

describe("adding tracking in a sample shop", () => {
  it("simulates the upload, then the carrier's scans arrive over the next days", async () => {
    const { store, shop, clock } = await sampleCopy();
    const result = await addTracking({
      store,
      shop,
      orderId: "W-1101",
      request: { carrier: "USPS", number: "9400 1118 9922 3346 1234 56" },
      now: new Date(clock.now),
    });
    expect(result.simulated).toBe(true);
    expect(result.order.status).toBe("label_created");
    expect(result.order.tracking).toMatchObject({
      carrier: "USPS",
      number: "9400111899223346123456",
      uploaded: true,
      deliveredAt: null,
    });
    expect(result.order.tracking!.events).toHaveLength(1);
    expect(result.order.tracking!.events![0]).toMatchObject({
      status: "label_created",
      detail: "Shipping Label Created, USPS Awaiting Item",
    });
    expect(result.order.checks.covered).toBe(true);
    expect((await loadPendingScans(store, shop.id))["W-1101"]!.length).toBeGreaterThan(4);

    const later = clock.now + 4 * DAY;
    const [order] = await catchUpScans(
      store,
      shop,
      [(await store.getOrder(shop.id, "W-1101"))!],
      later,
    );
    expect(order!.status).toBe("delivered");
    expect(order!.tracking!.deliveredAt).not.toBeNull();
    expect(order!.tracking!.events!.at(-1)!.location).toBe("EUGENE, OR 97405");
    expect((await store.getOrder(shop.id, "W-1101"))!.status).toBe("delivered");
    expect((await loadPendingScans(store, shop.id))["W-1101"]).toBeUndefined();
  });

  it("refuses orders it can't track", async () => {
    const { store, shop } = await sampleCopy();
    const request = { carrier: "USPS" as const, number: "9400111899223346123456" };
    await expect(addTracking({ store, shop, orderId: "W-0001", request })).rejects.toMatchObject({
      status: 404,
    });
    const shipped = (await store.listOrders(shop.id)).find(
      (o) => o.status === "delivered" && o.tracking?.uploaded,
    )!;
    await expect(addTracking({ store, shop, orderId: shipped.id, request })).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/already has tracking/),
    });
    const refunded = (await store.listOrders(shop.id)).find((o) => o.status === "refunded")!;
    await expect(addTracking({ store, shop, orderId: refunded.id, request })).rejects.toMatchObject(
      { status: 409 },
    );
  });
});

describe("adding tracking in a connected shop", () => {
  const config = {
    clientId: "id",
    clientSecret: "secret",
    base: "https://api-m.sandbox.paypal.com",
  };
  const live = testRealShop();
  const LIVE = live.id;
  const order: Order = {
    id: "W-1045",
    paypalOrderId: "5O190127TN364715T",
    captureId: "3C679366HH908993F",
    buyer: { name: "John Doe", email: "buyer@example.com" },
    items: [{ productId: "p-fig-linen", name: "Fig & Linen", quantity: 1, unitPrice: 3200 }],
    placedAt: created,
    status: "paid",
    amount: 3200,
    protection: "ELIGIBLE",
    paypalAddress: {
      line1: "2211 N First St",
      city: "San Jose",
      state: "CA",
      postalCode: "95131",
      country: "US",
    },
    shipTo: {
      line1: "2211 N First St",
      city: "San Jose",
      state: "CA",
      postalCode: "95131",
      country: "US",
    },
    tracking: null,
  };

  function fake(answer: Response) {
    const calls: { url: string; body: string }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "t", expires_in: 32400 }), {
          status: 200,
        });
      }
      calls.push({ url: String(url).replace(config.base, ""), body: String(init?.body) });
      return answer;
    }) as unknown as typeof fetch;
    return { paypal: new PayPal(config, fetchImpl), calls };
  }

  it("sends the tracking to PayPal's track API for the order's capture", async () => {
    const store = new MemoryStore();
    await store.saveOrder(LIVE, order);
    const { paypal, calls } = fake(
      new Response(JSON.stringify({ id: order.paypalOrderId, status: "COMPLETED" }), {
        status: 201,
      }),
    );
    const result = await addTracking({
      store,
      shop: live,
      orderId: "W-1045",
      request: { carrier: "USPS", number: "9400111899223346123456" },
      paypal,
    });
    expect(calls).toEqual([
      {
        url: "/v2/checkout/orders/5O190127TN364715T/track",
        body: JSON.stringify({
          capture_id: "3C679366HH908993F",
          tracking_number: "9400111899223346123456",
          carrier: "USPS",
          notify_payer: false,
        }),
      },
    ]);
    expect(result).toMatchObject({
      simulated: false,
      order: {
        status: "shipped",
        tracking: { uploaded: true, scans: "none", paypalStatus: "SHIPPED", events: [] },
      },
    });
    expect(await loadPendingScans(store, LIVE)).toEqual({});
  });

  it("uses the trackers API for a payment made outside Orders v2", async () => {
    const store = new MemoryStore();
    await store.saveOrder(LIVE, { ...order, paypalOrderId: null });
    const { paypal, calls } = fake(
      new Response(JSON.stringify({ tracker_identifiers: [{ transaction_id: order.captureId }] }), {
        status: 200,
      }),
    );
    await addTracking({
      store,
      shop: live,
      orderId: "W-1045",
      request: { carrier: "UPS", number: "1Z999AA10123456784" },
      paypal,
    });
    expect(calls).toEqual([
      {
        url: "/v1/shipping/trackers-batch",
        body: JSON.stringify({
          trackers: [
            {
              transaction_id: "3C679366HH908993F",
              tracking_number: "1Z999AA10123456784",
              status: "SHIPPED",
              carrier: "UPS",
            },
          ],
        }),
      },
    ]);
  });

  it("refuses when the app can't add tracking, or the shop isn't connected", async () => {
    const store = new MemoryStore();
    await store.saveOrder(LIVE, order);
    const request = { carrier: "USPS" as const, number: "9400111899223346123456" };
    const noTracking = testRealShop(undefined, {
      paypal: testConnection({
        features: {
          disputes: true,
          respond: true,
          transactions: false,
          tracking: false,
          webhooks: true,
        },
      }),
    });
    await expect(
      addTracking({
        store,
        shop: noTracking,
        orderId: "W-1045",
        request,
        paypal: fake(new Response("{}")).paypal,
      }),
    ).rejects.toMatchObject({ status: 409, code: "paypal_missing_features" });
    await expect(
      addTracking({ store, shop: live, orderId: "W-1045", request, paypal: null }),
    ).rejects.toMatchObject({ status: 409, code: "paypal_not_connected" });
  });

  it("reports PayPal's refusal plainly", async () => {
    const store = new MemoryStore();
    await store.saveOrder(LIVE, order);
    const { paypal } = fake(
      new Response(
        JSON.stringify({
          name: "UNPROCESSABLE_ENTITY",
          message: "Invalid tracking number",
          debug_id: "abc",
        }),
        { status: 422 },
      ),
    );
    await expect(
      addTracking({
        store,
        shop: live,
        orderId: "W-1045",
        request: { carrier: "USPS", number: "123456789" },
        paypal,
      }),
    ).rejects.toMatchObject({
      status: 422,
      message:
        "PayPal didn't accept the tracking: Invalid tracking number (UNPROCESSABLE_ENTITY). PayPal debug ID abc.",
    });
    expect((await store.getOrder(LIVE, "W-1045"))!.tracking).toBeNull();
  });
});

describe("order helpers", () => {
  it("puts orders waiting to ship first, newest first", async () => {
    const { store, shop } = await sampleCopy();
    const sorted = sortOrders(await store.listOrders(shop.id));
    expect(sorted.slice(0, 2).map((o) => o.id)).toEqual(["W-1102", "W-1101"]);
    expect(Date.parse(sorted[2]!.placedAt)).toBeGreaterThan(Date.parse(sorted[3]!.placedAt));
  });

  it("links each order to its case", async () => {
    const { store, shop } = await sampleCopy();
    const cases = await store.listCases(shop.id);
    const kase = cases.find((c) => c.id === "demo-inr-86")!;
    const order = (await store.getOrder(shop.id, kase.orderId))!;
    expect(withChecks(order, cases)).toMatchObject({
      caseId: "demo-inr-86",
      checks: { covered: true },
    });
  });

  it("writes tracking numbers the way carriers print them", () => {
    expect(normalizeTrackingNumber("1z 999-aa1 01 2345 6784")).toBe("1Z999AA10123456784");
  });
});
