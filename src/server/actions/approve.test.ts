import { describe, expect, it, vi } from "vitest";
import type { ApproveRequest } from "@/lib/api-types";
import type { Case, Draft } from "@/lib/domain";
import { testRealShop, testSampleShop } from "@/server/testing/shops";
import { PayPal } from "@/server/paypal/client";
import { PayPalExtras } from "@/server/paypal/extras";
import { MemoryStore } from "@/server/store/memory";
import { approveCase, endpointFor, liveAction, plannedAction } from "./approve";
import { playDueReactions, type StoredCase } from "./reactions";

const SECOND = 1000;
const created = "2026-10-28T15:20:00.000Z";

/** A seeded sample shop in a memory store whose clock the test moves. */
async function sampleCopy() {
  const clock = { now: Date.parse(created) };
  const store = new MemoryStore(() => clock.now);
  const shop = await testSampleShop(store, created);
  const at = () => new Date(clock.now);
  const approve = (caseId: string, request: ApproveRequest) =>
    approveCase({ store, shop, caseId, request, now: at() });
  const play = async (caseId: string) => {
    const kase = (await store.getCase(shop.id, caseId))!;
    const [played] = await playDueReactions(store, shop, [kase], at());
    return played!;
  };
  return { store, shop, clock, approve, play };
}

const draft = (kind: Draft["kind"], text: string, extra: Partial<Draft> = {}): Draft => ({
  kind,
  text,
  evidenceIds: ["E1", "E3"],
  ...extra,
});

describe("approving in a sample shop", () => {
  it("records the step as simulated, then the not-received buyer closes the case", async () => {
    const { store, shop, clock, approve, play } = await sampleCopy();
    const result = await approve("demo-inr-86", {
      move: "fight",
      draft: draft(
        "message",
        "USPS shows your order delivered to the parcel locker on Saturday at 2:14 pm.",
      ),
    });
    expect(result.simulated).toBe(true);
    expect(result.paypal).toEqual({
      endpoint: "POST /v1/customer/disputes/PP-D-48121/send-message",
      status: 200,
    });
    expect(result.case.status).toBe("waiting_buyer");
    expect(result.case.messages.at(-1)).toMatchObject({
      from: "seller",
      text: expect.stringMatching(/parcel locker/),
    });
    const [approved, sent] = result.events.slice(-2);
    expect(approved).toMatchObject({
      kind: "approved",
      actor: "seller",
      title: "You approved the reply to Sam Rivera",
    });
    expect(sent).toMatchObject({ kind: "sent", actor: "truce", simulated: true });
    expect(sent!.detail).toBe("Simulated in this sample shop");
    const pending = (result.case as StoredCase).pendingReaction!;
    expect(Date.parse(pending.dueAt) - clock.now).toBe(7 * SECOND);

    // Not yet due: nothing happens.
    clock.now += 5 * SECOND;
    expect((await play("demo-inr-86")).status).toBe("waiting_buyer");

    clock.now += 3 * SECOND;
    const closed = await play("demo-inr-86");
    expect(closed).toMatchObject({
      status: "closed",
      outcome: "buyer_closed",
      moneyKept: 8600,
      feeCharged: 0,
      feeAvoided: 0,
    });
    expect((closed as StoredCase).pendingReaction).toBeUndefined();
    expect(closed.messages.at(-1)).toMatchObject({
      from: "buyer",
      text: expect.stringMatching(/parcel locker/),
    });
    const titles = (await store.listEvents(shop.id, "demo-inr-86")).map((e) => e.title);
    expect(titles.slice(-2)).toEqual(["Sam found the parcel", "Sam Rivera closed the case"]);

    // Playing again changes nothing.
    expect(await play("demo-inr-86")).toEqual(closed);
    expect(await store.listEvents(shop.id, "demo-inr-86")).toHaveLength(titles.length);
  });

  it("settles the size complaint for $10, avoiding the claim fee", async () => {
    const { store, shop, clock, approve, play } = await sampleCopy();
    const result = await approve("demo-nad-42", {
      move: "settle",
      draft: draft(
        "offer",
        "We're sorry it's smaller than you expected. We'd like to refund $10, and you keep the candle.",
        { offerAmount: 1000 },
      ),
    });
    expect(result.paypal?.endpoint).toBe("POST /v1/customer/disputes/PP-D-48133/make-offer");
    expect(result.events.at(-2)?.title).toBe("You approved a $10 partial refund offer");
    clock.now += 8 * SECOND;
    const closed = await play("demo-nad-42");
    expect(closed).toMatchObject({
      outcome: "settled",
      moneyKept: 3200,
      feeCharged: 0,
      feeAvoided: 1500,
    });
    expect((await store.getOrder(shop.id, closed.orderId))!.status).toBe("partially_refunded");
  });

  it("fights the unauthorized claim with evidence, and PayPal rules for the seller two minutes later", async () => {
    const { clock, approve, play } = await sampleCopy();
    const result = await approve("demo-unauth-120", {
      move: "fight",
      draft: draft(
        "evidence",
        "The order shipped to the address on the payment and was delivered.",
        { evidenceType: "PROOF_OF_FULFILLMENT" },
      ),
    });
    expect(result.paypal?.endpoint).toBe("POST /v1/customer/disputes/PP-D-48114/provide-evidence");
    expect(result.case.status).toBe("with_paypal");
    expect(result.case.messages).toHaveLength(2);
    clock.now += 119 * SECOND;
    expect((await play("demo-unauth-120")).status).toBe("with_paypal");
    clock.now += 2 * SECOND;
    expect(await play("demo-unauth-120")).toMatchObject({
      outcome: "won",
      moneyKept: 12000,
      feeCharged: 0,
    });
  });

  it("refunds the cracked mug at once, with no fee, and the buyer says thanks", async () => {
    const { store, shop, clock, approve, play } = await sampleCopy();
    const result = await approve("demo-damaged-28", {
      move: "refund",
      draft: draft("refund", "We're so sorry the mug arrived cracked. We've refunded you in full."),
    });
    expect(result.paypal?.endpoint).toBe("POST /v1/customer/disputes/PP-D-48139/accept-claim");
    expect(result.case).toMatchObject({
      status: "closed",
      outcome: "refunded",
      moneyKept: 0,
      feeCharged: 0,
    });
    expect((await store.getOrder(shop.id, result.case.orderId))!.status).toBe("refunded");
    clock.now += 7 * SECOND;
    const after = await play("demo-damaged-28");
    expect(after.messages.at(-1)).toMatchObject({
      from: "buyer",
      text: "Thank you, that was quick. I'll order another one.",
    });
    expect(after.status).toBe("closed");
  });

  it("charges the claim fee when a not-received claim is refunded", async () => {
    const { approve } = await sampleCopy();
    const result = await approve("demo-inr-64", {
      move: "refund",
      draft: draft("refund", "Sorry it never arrived. We've refunded you."),
    });
    expect(result.case).toMatchObject({ outcome: "refunded", feeCharged: 1500, feeAvoided: 0 });
  });

  it("escalates when the seller fights a fair complaint, and the claim is then lost", async () => {
    const { store, shop, clock, approve, play } = await sampleCopy();
    await approve("demo-nad-42", {
      move: "fight",
      draft: draft("message", "The listing gives the size as 3 by 4 inches."),
    });
    clock.now += 10 * SECOND;
    const escalated = await play("demo-nad-42");
    expect(escalated).toMatchObject({ stage: "claim", status: "needs_you" });
    expect(Date.parse(escalated.dueAt!) - clock.now).toBeGreaterThan(9 * 24 * 3600 * SECOND);
    expect((await store.listEvents(shop.id, "demo-nad-42")).at(-1)?.kind).toBe("escalated");

    clock.now += 60 * SECOND;
    const fought = await approve("demo-nad-42", {
      move: "fight",
      draft: draft("evidence", "The listing states the size."),
    });
    expect(fought.paypal?.endpoint).toMatch(/provide-evidence$/);
    clock.now += 121 * SECOND;
    expect(await play("demo-nad-42")).toMatchObject({
      outcome: "lost",
      moneyKept: 0,
      feeCharged: 1500,
    });
  });

  it("turns a low offer on the broken mug into a claim", async () => {
    const { clock, approve, play } = await sampleCopy();
    await approve("demo-damaged-28", {
      move: "settle",
      draft: draft("offer", "Here's $5 for the trouble.", { offerAmount: 500 }),
    });
    clock.now += 10 * SECOND;
    expect(await play("demo-damaged-28")).toMatchObject({ stage: "claim", status: "needs_you" });
  });

  it("refuses steps that can't happen, with plain reasons", async () => {
    const { approve } = await sampleCopy();
    const offer = (amount: number) => ({
      move: "settle" as const,
      draft: draft("offer", "An offer", { offerAmount: amount }),
    });
    await expect(approve("demo-inr-64", offer(1000))).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/only be made while it's an inquiry/),
    });
    await expect(approve("demo-nad-42", offer(4200))).rejects.toMatchObject({ status: 400 });
    await expect(
      approve("demo-nad-42", { move: "settle", draft: draft("offer", "No amount") }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      approve("demo-mug-dispute", { move: "refund", draft: draft("refund", "x") }),
    ).rejects.toMatchObject({ status: 409, message: "This case is already closed." });
    await expect(
      approve("nope", { move: "refund", draft: draft("refund", "x") }),
    ).rejects.toMatchObject({ status: 404 });

    await approve("demo-inr-86", {
      move: "fight",
      draft: draft("message", "Tracking shows delivery."),
    });
    await expect(
      approve("demo-inr-86", { move: "fight", draft: draft("message", "Again") }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("sends once when the seller taps approve twice", async () => {
    const { approve, store, shop } = await sampleCopy();
    const request = { move: "fight" as const, draft: draft("message", "Tracking shows delivery.") };
    const results = await Promise.allSettled([
      approve("demo-inr-86", request),
      approve("demo-inr-86", request),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    const sent = (await store.listEvents(shop.id, "demo-inr-86")).filter((e) => e.kind === "sent");
    expect(sent).toHaveLength(1);
  });
});

describe("which PayPal call a move makes", () => {
  const base = { stage: "inquiry", status: "needs_you" } as Case;
  it("follows the table: message, evidence, supporting info, offer, accept", () => {
    expect(plannedAction(base, "fight")).toBe("send_message");
    expect(plannedAction({ ...base, stage: "claim" }, "fight")).toBe("provide_evidence");
    expect(plannedAction({ ...base, stage: "claim", status: "with_paypal" }, "fight")).toBe(
      "provide_supporting_info",
    );
    expect(plannedAction(base, "settle")).toBe("make_offer");
    expect(plannedAction({ ...base, stage: "claim" }, "refund")).toBe("accept_claim");
    expect(endpointFor("accept_claim", "PP-D-1")).toBe(
      "POST /v1/customer/disputes/PP-D-1/accept-claim",
    );
  });
});

// ---------- A connected shop, with PayPal faked at the HTTP level ----------

const config = { clientId: "id", clientSecret: "secret", base: "https://api-m.sandbox.paypal.com" };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Answers token requests itself, and everything else from the script in order. */
function fakePayPal(...script: (Response | Error)[]) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    if (href.endsWith("/v1/oauth2/token"))
      return json(200, { access_token: "t", expires_in: 32400 });
    calls.push({
      url: href.replace(config.base, ""),
      method: init?.method ?? "GET",
      body: init?.body,
    });
    const next = script.shift();
    if (!next) throw new Error(`Unexpected call to ${href}`);
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return {
    paypal: new PayPal(config, fetchImpl),
    extras: new PayPalExtras(config, fetchImpl),
    calls,
  };
}

const link = (rel: string) => ({
  rel,
  href: `${config.base}/v1/customer/disputes/PP-D-9/${rel}`,
  method: "POST",
});

function dispute(
  stage: "INQUIRY" | "CHARGEBACK",
  status: string,
  rels: string[],
  extra: Record<string, unknown> = {},
) {
  return {
    dispute_id: "PP-D-9",
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    status,
    dispute_life_cycle_stage: stage,
    dispute_channel: "INTERNAL",
    dispute_amount: { currency_code: "USD", value: "86.00" },
    create_time: "2026-10-27T17:51:00.000Z",
    update_time: "2026-10-27T18:00:00.000Z",
    links: [
      { rel: "self", href: `${config.base}/v1/customer/disputes/PP-D-9`, method: "GET" },
      ...rels.map(link),
    ],
    ...extra,
  };
}

const LIVE = "sh_realshop00000001";

/** A real shop connected to a sandbox app, holding one dispute (PP-D-9) on a seeded order. */
async function liveCase(stage: Case["stage"], status: Case["status"]) {
  const store = new MemoryStore();
  const shop = testRealShop(undefined, { id: LIVE, orderHistory: "full" });
  const seeded = await sampleCopy();
  const order = (await seeded.store.getOrder(
    seeded.shop.id,
    (await seeded.store.getCase(seeded.shop.id, "demo-inr-86"))!.orderId,
  ))!;
  const kase = (await seeded.store.getCase(seeded.shop.id, "demo-inr-86"))!;
  await store.saveOrder(LIVE, order);
  await store.saveCase(LIVE, { ...kase, id: "PP-D-9", paypalDisputeId: "PP-D-9", stage, status });
  return { store, shop, order };
}

describe("approving in a connected shop", () => {
  it("sends a message on an inquiry", async () => {
    const { store, shop } = await liveCase("inquiry", "needs_you");
    const fake = fakePayPal(
      json(
        200,
        dispute("INQUIRY", "WAITING_FOR_SELLER_RESPONSE", [
          "send_message",
          "make_offer",
          "accept_claim",
        ]),
      ),
      json(200, { links: [] }),
    );
    const result = await approveCase({
      store,
      shop,
      caseId: "PP-D-9",
      request: { move: "fight", draft: draft("message", "It was delivered.") },
      ...fake,
    });
    expect(fake.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET /v1/customer/disputes/PP-D-9",
      "POST /v1/customer/disputes/PP-D-9/send-message",
    ]);
    expect(JSON.parse(String(fake.calls[1]!.body))).toEqual({ message: "It was delivered." });
    expect(result).toMatchObject({
      simulated: false,
      paypal: { endpoint: "POST /v1/customer/disputes/PP-D-9/send-message", status: 200 },
    });
    // The call is in the result; the timeline only says it was sent.
    expect(result.events.at(-1)).toMatchObject({ kind: "sent" });
    expect(result.events.at(-1)?.detail).toBeUndefined();
    expect(result.events.at(-1)?.simulated).toBeUndefined();
    expect((result.case as StoredCase).pendingReaction).toBeUndefined();
  });

  it("makes a REFUND offer for the amount on an inquiry", async () => {
    const { store, shop } = await liveCase("inquiry", "needs_you");
    const fake = fakePayPal(
      json(
        200,
        dispute("INQUIRY", "WAITING_FOR_SELLER_RESPONSE", ["make_offer"], {
          allowed_response_options: { make_offer: { offer_types: ["REFUND"] } },
        }),
      ),
      json(200, {}),
    );
    await approveCase({
      store,
      shop,
      caseId: "PP-D-9",
      request: { move: "settle", draft: draft("offer", "Here's $10 back.", { offerAmount: 1000 }) },
      ...fake,
    });
    expect(fake.calls[1]!.url).toBe("/v1/customer/disputes/PP-D-9/make-offer");
    expect(JSON.parse(String(fake.calls[1]!.body))).toEqual({
      note: "Here's $10 back.",
      offer_type: "REFUND",
      offer_amount: { currency_code: "USD", value: "10.00" },
    });
  });

  it("provides proof of fulfillment with tracking and a PDF on a claim waiting for the seller", async () => {
    const { store, shop, order } = await liveCase("claim", "needs_you");
    const fake = fakePayPal(
      json(
        200,
        dispute("CHARGEBACK", "WAITING_FOR_SELLER_RESPONSE", ["accept_claim", "provide_evidence"]),
      ),
      json(200, {}),
    );
    const result = await approveCase({
      store,
      shop,
      caseId: "PP-D-9",
      request: {
        move: "fight",
        draft: draft("evidence", "Delivered to the address on the payment."),
      },
      ...fake,
    });
    expect(fake.calls[1]!.url).toBe("/v1/customer/disputes/PP-D-9/provide-evidence");
    const form = fake.calls[1]!.body as FormData;
    const input = JSON.parse(await (form.get("input") as Blob).text());
    expect(input.evidences[0]).toEqual({
      evidence_type: "PROOF_OF_FULFILLMENT",
      evidence_info: {
        tracking_info: [{ carrier_name: "USPS", tracking_number: order.tracking!.number }],
      },
      notes: "Delivered to the address on the payment.",
    });
    const pdf = form.get("evidence-file") as File;
    expect(pdf.name).toBe("evidence-PP-D-9.pdf");
    expect(new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 8))).toBe("%PDF-1.4");
    expect(result.case.status).toBe("with_paypal");
  });

  it("adds supporting information to a claim PayPal is reviewing", async () => {
    const { store, shop } = await liveCase("claim", "with_paypal");
    const fake = fakePayPal(
      json(200, dispute("CHARGEBACK", "UNDER_REVIEW", ["provide_supporting_info"])),
      json(200, {}),
    );
    await approveCase({
      store,
      shop,
      caseId: "PP-D-9",
      request: { move: "fight", draft: draft("message", "More detail.") },
      ...fake,
    });
    expect(fake.calls[1]).toMatchObject({
      method: "POST",
      url: "/v1/customer/disputes/PP-D-9/provide-supporting-info",
    });
    expect(JSON.parse(String(fake.calls[1]!.body))).toEqual({ notes: "More detail." });
  });

  it("accepts the claim with a REFUND and closes the case", async () => {
    const { store, shop } = await liveCase("claim", "needs_you");
    const fake = fakePayPal(
      json(
        200,
        dispute("CHARGEBACK", "WAITING_FOR_SELLER_RESPONSE", ["accept_claim", "provide_evidence"], {
          allowed_response_options: { accept_claim: { accept_claim_types: ["REFUND"] } },
        }),
      ),
      json(200, {}),
    );
    const result = await approveCase({
      store,
      shop,
      caseId: "PP-D-9",
      request: { move: "refund", draft: draft("refund", "Refunded in full.") },
      ...fake,
    });
    expect(JSON.parse(String(fake.calls[1]!.body))).toEqual({
      note: "Refunded in full.",
      accept_claim_type: "REFUND",
    });
    expect(result.case).toMatchObject({ status: "closed", outcome: "refunded" });
  });

  it("says what PayPal allows when the dispute's links don't allow the move, and sends nothing", async () => {
    const { store, shop } = await liveCase("claim", "with_paypal");
    const fake = fakePayPal(
      json(200, dispute("CHARGEBACK", "UNDER_REVIEW", ["provide_supporting_info"])),
    );
    const refused = approveCase({
      store,
      shop,
      caseId: "PP-D-9",
      request: { move: "refund", draft: draft("refund", "x") },
      ...fake,
    });
    await expect(refused).rejects.toMatchObject({
      status: 409,
      message:
        "PayPal doesn't allow accepting the claim on this dispute right now. It allows adding supporting information.",
    });
    expect(fake.calls).toHaveLength(1);
    expect((await store.getCase(LIVE, "PP-D-9"))!.status).toBe("with_paypal");
  });

  it("explains PayPal's refusal and leaves the case as it was", async () => {
    const { store, shop } = await liveCase("claim", "needs_you");
    const fake = fakePayPal(
      json(200, dispute("CHARGEBACK", "WAITING_FOR_SELLER_RESPONSE", ["provide_evidence"])),
      json(422, {
        name: "UNPROCESSABLE_ENTITY",
        message: "The requested action could not be performed.",
        debug_id: "f00d",
        details: [{ issue: "ACTION_NOT_ALLOWED_IN_CURRENT_DISPUTE_STATE" }],
      }),
    );
    const request = { move: "fight" as const, draft: draft("evidence", "Delivered.") };
    await expect(
      approveCase({ store, shop, caseId: "PP-D-9", request, ...fake }),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "PayPal doesn't allow sending evidence in the dispute's current state. Refresh to see where it stands. PayPal debug ID f00d.",
    });
    expect(await store.listEvents(LIVE, "PP-D-9")).toEqual([]);
    expect((await store.getCase(LIVE, "PP-D-9"))!.status).toBe("needs_you");

    // Nothing was sent, so trying again straight away is allowed.
    const retry = fakePayPal(
      json(200, dispute("CHARGEBACK", "WAITING_FOR_SELLER_RESPONSE", ["provide_evidence"])),
      json(200, {}),
    );
    await expect(
      approveCase({ store, shop, caseId: "PP-D-9", request, ...retry }),
    ).resolves.toMatchObject({ simulated: false });
  });

  it("says so when PayPal can't be reached or isn't connected", async () => {
    const { store, shop } = await liveCase("inquiry", "needs_you");
    const request = { move: "fight" as const, draft: draft("message", "Hi") };
    const down = fakePayPal(new TypeError("fetch failed"));
    await expect(
      approveCase({ store, shop, caseId: "PP-D-9", request, ...down }),
    ).rejects.toMatchObject({
      status: 502,
      message: expect.stringMatching(/Couldn't reach PayPal/),
    });
    await expect(
      approveCase({ store, shop, caseId: "PP-D-9", request, paypal: null }),
    ).rejects.toMatchObject({ status: 409, code: "paypal_not_connected" });
  });

  it("only offers on inquiries, by PayPal's own links too", () => {
    expect(() =>
      liveAction(
        dispute("CHARGEBACK", "WAITING_FOR_SELLER_RESPONSE", [
          "accept_claim",
          "provide_evidence",
        ]) as never,
        "settle",
      ),
    ).toThrow(
      /Offers are only possible while it's an inquiry. It allows sending evidence or accepting the claim./,
    );
  });
});
