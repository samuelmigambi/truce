import "server-only";

import type * as P from "./types";

/**
 * A small, typed client for the PayPal REST APIs Truce uses: Orders v2 (checkout, capture,
 * tracking) and Customer Disputes v1. The keys stay on the server; tokens are cached until just
 * before they expire.
 */

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  /** https://api-m.sandbox.paypal.com or https://api-m.paypal.com */
  base: string;
}

/** From PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_ENV ("sandbox" unless "live"). */
export function paypalConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): PayPalConfig | null {
  const clientId = env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const live = env.PAYPAL_ENV?.trim().toLowerCase() === "live";
  return {
    clientId,
    clientSecret,
    base: live ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com",
  };
}

/** A PayPal API error, with the fields PayPal returns for debugging. */
export class PayPalError extends Error {
  constructor(
    readonly status: number,
    readonly issue: string,
    message: string,
    readonly debugId: string | null,
    readonly details: unknown,
  ) {
    super(message);
    this.name = "PayPalError";
  }
}

type Fetch = typeof fetch;
type Body = { json: unknown } | { form: FormData } | undefined;

export class PayPal {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: PayPalConfig,
    private readonly fetchImpl: Fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  get sandbox(): boolean {
    return this.config.base.includes("sandbox");
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now()) return this.token.value;
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString(
      "base64",
    );
    const response = await this.fetchImpl(`${this.config.base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!response.ok) throw await toError(response);
    const data = (await response.json()) as { access_token: string; expires_in: number };
    // Renew a minute early, so a token never expires mid-request.
    this.token = {
      value: data.access_token,
      expiresAt: this.now() + Math.max(0, data.expires_in - 60) * 1000,
    };
    return this.token.value;
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: Body,
    headers: Record<string, string> = {},
    retried = false,
  ): Promise<T> {
    const init: RequestInit & { headers: Record<string, string> } = {
      method,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, ...headers },
    };
    if (body && "json" in body) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body.json);
    } else if (body && "form" in body) {
      // fetch sets the multipart boundary itself.
      init.body = body.form;
    }
    const response = await this.fetchImpl(`${this.config.base}${path}`, init);
    if (response.status === 401 && !retried) {
      this.token = null;
      return this.request(method, path, body, headers, true);
    }
    if (!response.ok) throw await toError(response);
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  // ---------- Orders v2 ----------

  /** Creates an order; `requestId` makes retries safe (PayPal-Request-Id). */
  createOrder(order: P.CreateOrder, requestId: string): Promise<P.Order> {
    return this.request("POST", "/v2/checkout/orders", { json: order }, {
      "PayPal-Request-Id": requestId,
      Prefer: "return=representation",
    });
  }

  captureOrder(orderId: string, requestId: string): Promise<P.Order> {
    return this.request("POST", `/v2/checkout/orders/${enc(orderId)}/capture`, { json: {} }, {
      "PayPal-Request-Id": requestId,
      Prefer: "return=representation",
    });
  }

  getOrder(orderId: string): Promise<P.Order> {
    return this.request("GET", `/v2/checkout/orders/${enc(orderId)}`);
  }

  /** Adds tracking to a captured order. Seller Protection depends on it. */
  addTracking(orderId: string, tracking: P.AddTracking): Promise<P.Order> {
    return this.request("POST", `/v2/checkout/orders/${enc(orderId)}/track`, { json: tracking });
  }

  // ---------- Customer Disputes v1 ----------

  listDisputes(query: P.ListDisputes = {}): Promise<P.DisputeList> {
    const params = new URLSearchParams();
    if (query.states?.length) params.set("dispute_state", query.states.join(","));
    if (query.createdAfter) params.set("create_time_after", query.createdAfter);
    params.set("page_size", String(query.pageSize ?? 50));
    if (query.page) params.set("page", String(query.page));
    return this.request("GET", `/v1/customer/disputes?${params}`);
  }

  getDispute(id: string): Promise<P.Dispute> {
    return this.request("GET", `/v1/customer/disputes/${enc(id)}`);
  }

  /** Inquiry stage only. */
  sendMessage(id: string, message: string): Promise<P.LinkResponse> {
    return this.request("POST", `/v1/customer/disputes/${enc(id)}/send-message`, {
      json: { message },
    });
  }

  /** Inquiry stage only. */
  makeOffer(id: string, offer: P.MakeOffer): Promise<P.LinkResponse> {
    return this.request("POST", `/v1/customer/disputes/${enc(id)}/make-offer`, { json: offer });
  }

  /** Only while the dispute waits for the seller's response. Files: jpg, png, gif or pdf, 10 MB each. */
  provideEvidence(id: string, evidence: P.ProvideEvidence, files: P.EvidenceFile[] = []) {
    const form = new FormData();
    form.append(
      "input",
      new Blob([JSON.stringify(evidence)], { type: "application/json" }),
      "input.json",
    );
    for (const file of files) {
      form.append("evidence-file", new Blob([file.bytes.slice()], { type: file.type }), file.name);
    }
    return this.request<P.LinkResponse>(
      "POST",
      `/v1/customer/disputes/${enc(id)}/provide-evidence`,
      { form },
    );
  }

  acceptClaim(id: string, claim: P.AcceptClaim): Promise<P.LinkResponse> {
    return this.request("POST", `/v1/customer/disputes/${enc(id)}/accept-claim`, { json: claim });
  }

  escalate(id: string, note: string): Promise<P.LinkResponse> {
    return this.request("POST", `/v1/customer/disputes/${enc(id)}/escalate`, { json: { note } });
  }

  /** Sandbox only: decides a claim that is under review. */
  adjudicate(id: string, outcome: "BUYER_FAVOR" | "SELLER_FAVOR"): Promise<P.LinkResponse> {
    this.requireSandbox();
    return this.request("POST", `/v1/customer/disputes/${enc(id)}/adjudicate`, {
      json: { adjudication_outcome: outcome },
    });
  }

  /** Sandbox only: moves a claim under review back to waiting for one side's evidence. */
  requireEvidence(id: string, action: "BUYER_EVIDENCE" | "SELLER_EVIDENCE") {
    this.requireSandbox();
    return this.request<P.LinkResponse>(
      "POST",
      `/v1/customer/disputes/${enc(id)}/require-evidence`,
      { json: { action } },
    );
  }

  private requireSandbox() {
    if (!this.sandbox) throw new Error("This call only exists in PayPal's sandbox");
  }
}

const enc = encodeURIComponent;

async function toError(response: Response): Promise<PayPalError> {
  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    // Not JSON: keep the status alone.
  }
  const issue = String(data.name ?? data.error ?? `HTTP_${response.status}`);
  const message = String(data.message ?? data.error_description ?? response.statusText);
  const debugId = (data.debug_id as string | undefined) ?? response.headers.get("paypal-debug-id");
  return new PayPalError(response.status, issue, message, debugId ?? null, data.details ?? null);
}
