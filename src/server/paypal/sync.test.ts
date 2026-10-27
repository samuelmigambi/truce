import { describe, expect, it, vi } from "vitest";
import type { Order, Workspace } from "@/lib/domain";
import { MemoryStore } from "@/server/store/memory";
import { PayPal } from "./client";
import { PayPalExtras } from "./extras";
import {
  caseFromDispute,
  outcomeOf,
  statusOf,
  syncDisputes,
  syncIfStale,
  type DisputeDetails,
} from "./sync";
import { disputeIdOf, isDisputeEvent, verifyWebhook, webhookSignature } from "./webhook";

const config = { clientId: "id", clientSecret: "secret", base: "https://api-m.sandbox.paypal.com" };
const live: Workspace = {
  id: "live",
  kind: "live",
  shopName: "Wick & Ember",
  createdAt: "2026-10-27T12:00:00.000Z",
  expiresAt: null,
  lastSweepAt: null,
  seedVersion: null,
};

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

/** Answers by URL, so the test doesn't depend on call order. */
function fakePayPal(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    const path = String(url).replace(config.base, "");
    if (path === "/v1/oauth2/token") return ok({ access_token: "t", expires_in: 32400 });
    calls.push(path);
    const route = Object.keys(routes).find((prefix) => path.startsWith(prefix));
    if (!route) throw new Error(`Unexpected call to ${path}`);
    return routes[route]!();
  }) as unknown as typeof fetch;
  return {
    client: new PayPal(config, fetchImpl),
    extras: new PayPalExtras(config, fetchImpl),
    calls,
  };
}

const stored: Order = {
  id: "W-1042",
  paypalOrderId: "7TG079141N6014335",
  captureId: "4P61893970934542E",
  buyer: { name: "John Doe", email: "sb-buyer@personal.example.com" },
  items: [
    {
      productId: "p-cedar-smoke-trio",
      name: "Cedar & Smoke candle trio",
      quantity: 1,
      unitPrice: 8600,
    },
  ],
  placedAt: "2026-10-27T15:00:00.000Z",
  status: "shipped",
  amount: 8600,
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

const open: DisputeDetails = {
  dispute_id: "PP-R-SXM-10194828",
  reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
  status: "UNDER_REVIEW",
  dispute_life_cycle_stage: "CHARGEBACK",
  dispute_channel: "INTERNAL",
  dispute_amount: { currency_code: "USD", value: "86.00" },
  create_time: "2026-10-27T17:51:00.000Z",
  update_time: "2026-10-27T18:00:00.000Z",
  disputed_transactions: [
    {
      buyer_transaction_id: "1YS50350PR2157406",
      seller_transaction_id: "4P61893970934542E",
      buyer: { name: "John Doe" },
      items: [{ item_name: "Cedar & Smoke candle trio", item_quantity: "1" }],
    },
  ],
  evidences: [
    { evidence_type: "OTHER", source: "SUBMITTED_BY_BUYER", notes: "My candles never arrived." },
    { evidence_type: "PROOF_OF_FULFILLMENT", source: "REQUESTED_FROM_SELLER" },
  ],
  links: [{ rel: "provide_supporting_info", href: "x", method: "POST" }],
};

const resolved: DisputeDetails = {
  dispute_id: "PP-R-QZF-10194831",
  reason: "UNAUTHORISED",
  status: "RESOLVED",
  dispute_life_cycle_stage: "CHARGEBACK",
  dispute_channel: "INTERNAL",
  dispute_amount: { currency_code: "USD", value: "120.00" },
  create_time: "2026-10-27T17:57:54.000Z",
  update_time: "2026-10-29T09:00:00.000Z",
  seller_response_due_date: "2026-11-07T04:59:59.000Z",
  dispute_outcome: { outcome_code: "RESOLVED_SELLER_FAVOUR" },
  disputed_transactions: [
    {
      seller_transaction_id: "3KS28481UU8400353",
      custom: "W-1044",
      gross_amount: { currency_code: "USD", value: "120.00" },
      buyer: { name: "John Doe", email: "sb-buyer@personal.example.com" },
      items: [{ item_name: "Winter Grove gift box", item_quantity: "1" }],
    },
  ],
  messages: [
    {
      posted_by: "BUYER",
      time_posted: "2026-10-27T17:58:00.000Z",
      content: "I didn't make this purchase.",
    },
  ],
};

const summary = (d: DisputeDetails) => ({
  dispute_id: d.dispute_id,
  reason: d.reason,
  status: d.status,
  dispute_amount: d.dispute_amount,
  create_time: d.create_time,
  update_time: d.update_time,
});

describe("syncing disputes from PayPal", () => {
  it("brings every dispute in, links its order, and closes resolved ones with their fees", async () => {
    const store = new MemoryStore();
    await store.saveOrder("live", stored);
    const fake = fakePayPal({
      "/v1/customer/disputes?": () => ok({ items: [summary(open), summary(resolved)] }),
      [`/v1/customer/disputes/${open.dispute_id}`]: () => ok(open),
      [`/v1/customer/disputes/${resolved.dispute_id}`]: () => ok(resolved),
    });
    expect(await syncDisputes(store, live, fake.client)).toEqual({
      checked: 2,
      created: 2,
      updated: 0,
    });

    const first = (await store.getCase("live", open.dispute_id))!;
    expect(first).toMatchObject({
      orderId: "W-1042",
      reason: "not_received",
      stage: "claim",
      status: "with_paypal",
      amount: 8600,
      buyer: { name: "John Doe", email: "sb-buyer@personal.example.com" },
      buyerClaim: "My candles never arrived.",
      itemSummary: "Cedar & Smoke candle trio",
      dueAt: null,
    });
    const events = await store.listEvents("live", open.dispute_id);
    expect(events.map((e) => e.title)).toEqual([
      "John Doe filed a claim: item not received",
      "PayPal asked for proof of fulfillment",
    ]);

    const second = (await store.getCase("live", resolved.dispute_id))!;
    expect(second).toMatchObject({
      orderId: "W-1044",
      reason: "unauthorized",
      status: "closed",
      outcome: "won",
      moneyKept: 12000,
      feeCharged: 0,
    });
    expect(second.messages).toEqual([
      {
        id: expect.any(String),
        from: "buyer",
        at: "2026-10-27T17:58:00.000Z",
        text: "I didn't make this purchase.",
      },
    ]);
    const made = (await store.getOrder("live", "W-1044"))!;
    expect(made).toMatchObject({
      captureId: "3KS28481UU8400353",
      amount: 12000,
      items: [{ productId: "p-winter-grove-box", unitPrice: 12000 }],
    });

    // Unchanged disputes aren't fetched again.
    fake.calls.length = 0;
    expect(await syncDisputes(store, live, fake.client)).toEqual({
      checked: 2,
      created: 0,
      updated: 0,
    });
    expect(fake.calls).toEqual(["/v1/customer/disputes?page_size=50&page=1"]);
  });

  it("keeps Truce's own messages and events, and a case it closed, while PayPal catches up", async () => {
    const store = new MemoryStore();
    await store.saveOrder("live", stored);
    const fake = fakePayPal({
      "/v1/customer/disputes?": () => ok({ items: [summary(open)] }),
      [`/v1/customer/disputes/${open.dispute_id}`]: () => ok(open),
    });
    await syncDisputes(store, live, fake.client);
    const kase = (await store.getCase("live", open.dispute_id))!;
    const mine = {
      id: "m-1",
      from: "seller" as const,
      at: "2026-10-27T18:05:00.000Z",
      text: "Here's the tracking.",
    };
    await store.saveCase("live", {
      ...kase,
      status: "closed",
      outcome: "refunded",
      messages: [...kase.messages, mine],
      paypalUpdatedAt: "old",
    } as never);
    await store.addEvent("live", open.dispute_id, {
      id: "ev-mine",
      at: "2026-10-27T18:05:00.000Z",
      kind: "sent",
      actor: "truce",
      title: "Sent",
    });

    await syncDisputes(store, live, fake.client);
    const after = (await store.getCase("live", open.dispute_id))!;
    expect(after.status).toBe("closed");
    expect(after.messages).toContainEqual(mine);
    expect((await store.listEvents("live", open.dispute_id)).map((e) => e.id)).toContain("ev-mine");
  });

  it("syncs at most once a minute", async () => {
    const store = new MemoryStore();
    const fake = fakePayPal({ "/v1/customer/disputes?": () => ok({ items: [] }) });
    const now = new Date("2026-10-28T10:00:00.000Z");
    expect(await syncIfStale(store, live, fake.client, 60_000, now)).toEqual({
      checked: 0,
      created: 0,
      updated: 0,
    });
    expect(
      await syncIfStale(store, live, fake.client, 60_000, new Date(now.getTime() + 30_000)),
    ).toBeNull();
    expect(
      await syncIfStale(store, live, fake.client, 60_000, new Date(now.getTime() + 61_000)),
    ).not.toBeNull();
  });
});

describe("mapping PayPal's states", () => {
  it("puts each status in the seller's inbox", () => {
    expect(statusOf("WAITING_FOR_SELLER_RESPONSE")).toBe("needs_you");
    expect(statusOf("OPEN")).toBe("needs_you");
    expect(statusOf("WAITING_FOR_BUYER_RESPONSE")).toBe("waiting_buyer");
    expect(statusOf("UNDER_REVIEW")).toBe("with_paypal");
    expect(statusOf("RESOLVED")).toBe("closed");
  });

  it("reads outcomes, including partial refunds as settlements", () => {
    const base = { ...resolved, dispute_amount: { currency_code: "USD", value: "42.00" } };
    expect(outcomeOf({ ...base, dispute_outcome: { outcome_code: "CANCELED_BY_BUYER" } })).toEqual({
      outcome: "buyer_closed",
      refunded: 0,
    });
    expect(
      outcomeOf({
        ...base,
        dispute_outcome: {
          outcome_code: "ACCEPTED",
          amount_refunded: { currency_code: "USD", value: "10.00" },
        },
      }),
    ).toEqual({ outcome: "settled", refunded: 1000 });
    expect(
      outcomeOf({ ...base, dispute_outcome: { outcome_code: "RESOLVED_BUYER_FAVOUR" } }),
    ).toEqual({ outcome: "lost", refunded: 4200 });
    expect(outcomeOf({ ...base, dispute_outcome: { outcome_code: "ACCEPTED" } })).toEqual({
      outcome: "refunded",
      refunded: 4200,
    });
  });

  it("falls back to the stored order for the buyer and items", () => {
    const bare: DisputeDetails = {
      ...open,
      disputed_transactions: [{ seller_transaction_id: "4P61893970934542E" }],
      evidences: [],
    };
    expect(caseFromDispute(bare, null, stored)).toMatchObject({
      buyer: stored.buyer,
      itemSummary: "Cedar & Smoke candle trio",
      buyerClaim: "The buyer says the item didn't arrive.",
    });
  });
});

describe("webhooks", () => {
  const headers = new Headers({
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
    "paypal-transmission-id": "a1",
    "paypal-transmission-sig": "sig",
    "paypal-transmission-time": "2026-10-28T10:00:00Z",
  });
  const body = JSON.stringify({
    id: "WH-1",
    event_type: "CUSTOMER.DISPUTE.UPDATED",
    resource: { dispute_id: "PP-D-9" },
  });

  it("needs every signature header", () => {
    expect(webhookSignature(headers)).toMatchObject({ transmissionId: "a1" });
    const missing = new Headers(headers);
    missing.delete("paypal-transmission-sig");
    expect(webhookSignature(missing)).toBeNull();
  });

  it("trusts a webhook only when PayPal confirms the signature", async () => {
    let seen: Record<string, unknown> = {};
    const fake = fakePayPal({
      "/v1/notifications/verify-webhook-signature": () =>
        ok({ verification_status: seen.webhook_id === "WH-ID" ? "SUCCESS" : "FAILURE" }),
    });
    const spy = vi
      .spyOn(fake.extras, "verifyWebhookSignature")
      .mockImplementation(async (id, signature, event) => {
        seen = { webhook_id: id, signature, event };
        return id === "WH-ID";
      });
    expect(await verifyWebhook(fake.extras, "WH-ID", headers, body)).toBe(true);
    expect(seen).toMatchObject({
      event: { event_type: "CUSTOMER.DISPUTE.UPDATED" },
      signature: { transmissionSig: "sig" },
    });
    expect(await verifyWebhook(fake.extras, "OTHER", headers, body)).toBe(false);
    expect(await verifyWebhook(fake.extras, "WH-ID", headers, "not json")).toBe(false);
    expect(await verifyWebhook(fake.extras, "WH-ID", new Headers(), body)).toBe(false);
    spy.mockRestore();
  });

  it("calls verify-webhook-signature with the event and this app's webhook ID", async () => {
    let sent: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/v1/oauth2/token"))
        return ok({ access_token: "t", expires_in: 32400 });
      sent = JSON.parse(String(init?.body));
      return ok({ verification_status: "SUCCESS" });
    }) as unknown as typeof fetch;
    expect(await verifyWebhook(new PayPalExtras(config, fetchImpl), "WH-ID", headers, body)).toBe(
      true,
    );
    expect(sent).toMatchObject({
      webhook_id: "WH-ID",
      transmission_id: "a1",
      auth_algo: "SHA256withRSA",
      webhook_event: { id: "WH-1" },
    });
  });

  it("knows a dispute event and its dispute", () => {
    expect(isDisputeEvent({ event_type: "CUSTOMER.DISPUTE.CREATED" })).toBe(true);
    expect(isDisputeEvent({ event_type: "PAYMENT.CAPTURE.COMPLETED" })).toBe(false);
    expect(disputeIdOf({ resource: { dispute_id: "PP-D-9" } })).toBe("PP-D-9");
    expect(disputeIdOf({})).toBeNull();
  });
});
