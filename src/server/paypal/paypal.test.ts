import { describe, expect, it, vi } from "vitest";
import { PayPal, PayPalError, paypalConfigFromEnv } from "./client";
import { capturedOrder, reasonOf, stageOf } from "./map";
import type { Order } from "./types";

const config = { clientId: "id", clientSecret: "secret", base: "https://api-m.sandbox.paypal.com" };

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function fakeFetch(...responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("No more fake responses");
    return next;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const token = () => json(200, { access_token: "t1", expires_in: 32400 });

describe("paypalConfigFromEnv", () => {
  it("needs both keys and defaults to the sandbox", () => {
    expect(paypalConfigFromEnv({ PAYPAL_CLIENT_ID: "a" })).toBeNull();
    expect(paypalConfigFromEnv({ PAYPAL_CLIENT_ID: "a", PAYPAL_CLIENT_SECRET: "b" })?.base).toBe(
      "https://api-m.sandbox.paypal.com",
    );
  });
});

describe("PayPal client", () => {
  it("gets a token once and reuses it", async () => {
    const { impl, calls } = fakeFetch(token(), json(200, { items: [] }), json(200, { items: [] }));
    const paypal = new PayPal(config, impl);
    await paypal.listDisputes({ states: ["REQUIRED_ACTION"] });
    await paypal.listDisputes();
    expect(calls.map((c) => c.url)).toEqual([
      "https://api-m.sandbox.paypal.com/v1/oauth2/token",
      "https://api-m.sandbox.paypal.com/v1/customer/disputes?dispute_state=REQUIRED_ACTION&page_size=50",
      "https://api-m.sandbox.paypal.com/v1/customer/disputes?page_size=50",
    ]);
    expect((calls[1]!.init.headers as Record<string, string>).Authorization).toBe("Bearer t1");
  });

  it("gets a fresh token once when PayPal says 401", async () => {
    const { impl, calls } = fakeFetch(
      token(),
      json(401, { name: "AUTHENTICATION_FAILURE" }),
      json(200, { access_token: "t2", expires_in: 32400 }),
      json(200, { dispute_id: "PP-D-1" }),
    );
    const dispute = await new PayPal(config, impl).getDispute("PP-D-1");
    expect(dispute.dispute_id).toBe("PP-D-1");
    expect((calls[3]!.init.headers as Record<string, string>).Authorization).toBe("Bearer t2");
  });

  it("turns PayPal's errors into PayPalError", async () => {
    const { impl } = fakeFetch(
      token(),
      json(422, {
        name: "UNPROCESSABLE_ENTITY",
        message: "The requested action could not be performed.",
        debug_id: "abc123",
        details: [{ issue: "ACTION_NOT_ALLOWED_IN_CURRENT_DISPUTE_STATE" }],
      }),
    );
    const error = await new PayPal(config, impl).makeOffer("PP-D-1", {
      note: "Sorry",
      offer_type: "REFUND",
      offer_amount: { currency_code: "USD", value: "10.00" },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PayPalError);
    expect(error).toMatchObject({ status: 422, issue: "UNPROCESSABLE_ENTITY", debugId: "abc123" });
  });

  it("sends evidence as multipart, with the JSON in an input part", async () => {
    const { impl, calls } = fakeFetch(token(), json(200, { links: [] }));
    await new PayPal(config, impl).provideEvidence(
      "PP-D-1",
      {
        evidences: [
          {
            evidence_type: "PROOF_OF_FULFILLMENT",
            evidence_info: { tracking_info: [{ carrier_name: "USPS", tracking_number: "9400" }] },
            notes: "Delivered on 24 Oct",
          },
        ],
      },
      [{ name: "label.pdf", type: "application/pdf", bytes: new Uint8Array([37, 80, 68, 70]) }],
    );
    const form = calls[1]!.init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    const input = form.get("input") as Blob;
    expect(JSON.parse(await input.text()).evidences[0].evidence_type).toBe("PROOF_OF_FULFILLMENT");
    expect((form.get("evidence-file") as File).name).toBe("label.pdf");
  });

  it("only adjudicates in the sandbox", async () => {
    const live = new PayPal({ ...config, base: "https://api-m.paypal.com" }, fakeFetch().impl);
    expect(() => live.adjudicate("PP-D-1", "SELLER_FAVOR")).toThrow(/sandbox/);
  });
});

describe("mapping", () => {
  it("names reasons and stages in Truce's terms", () => {
    expect(reasonOf("UNAUTHORISED")).toBe("unauthorized");
    expect(reasonOf("MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED")).toBe("not_as_described");
    expect(stageOf({ dispute_life_cycle_stage: "INQUIRY", dispute_channel: "INTERNAL" })).toBe("inquiry");
    expect(stageOf({ dispute_life_cycle_stage: "CHARGEBACK", dispute_channel: "INTERNAL" })).toBe("claim");
    expect(stageOf({ dispute_life_cycle_stage: "CHARGEBACK", dispute_channel: "EXTERNAL" })).toBe("chargeback");
  });

  it("keeps the protection verdict and PayPal's address from a capture", () => {
    const order: Order = {
      id: "5O190127TN364715T",
      status: "COMPLETED",
      payer: { email_address: "buyer@example.com" },
      purchase_units: [
        {
          shipping: {
            name: { full_name: "Sam Rivera" },
            address: {
              address_line_1: "18 Linden St",
              admin_area_2: "Portland",
              admin_area_1: "OR",
              postal_code: "97205",
              country_code: "US",
            },
          },
          payments: {
            captures: [
              {
                id: "3C679366HH908993F",
                status: "COMPLETED",
                amount: { currency_code: "USD", value: "86.00" },
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
    expect(capturedOrder(order)).toMatchObject({
      captureId: "3C679366HH908993F",
      amount: 8600,
      protection: "ELIGIBLE",
      paypalAddress: { line1: "18 Linden St", city: "Portland", state: "OR" },
      shipToName: "Sam Rivera",
    });
  });
});
