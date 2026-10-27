import "server-only";

import { PayPalError, type PayPalConfig } from "./client";
import type * as P from "./types";

/**
 * The PayPal calls the main client doesn't make: provide-supporting-info, for a claim PayPal is
 * already reviewing, and webhook signature checks. Same keys, its own short-lived token.
 */

export interface WebhookSignature {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
}

export class PayPalExtras {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: PayPalConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

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
    this.token = {
      value: data.access_token,
      expiresAt: this.now() + Math.max(0, data.expires_in - 60) * 1000,
    };
    return this.token.value;
  }

  private async post<T>(path: string, json: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.config.base}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(json),
    });
    if (!response.ok) throw await toError(response);
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** Notes for a claim under review; the sandbox accepts a JSON `{ notes }`. */
  provideSupportingInfo(disputeId: string, notes: string): Promise<P.LinkResponse> {
    return this.post(
      `/v1/customer/disputes/${encodeURIComponent(disputeId)}/provide-supporting-info`,
      { notes },
    );
  }

  /** Asks PayPal whether a webhook really came from PayPal, for this app's webhook. */
  async verifyWebhookSignature(
    webhookId: string,
    signature: WebhookSignature,
    event: unknown,
  ): Promise<boolean> {
    const result = await this.post<{ verification_status?: string }>(
      "/v1/notifications/verify-webhook-signature",
      {
        auth_algo: signature.authAlgo,
        cert_url: signature.certUrl,
        transmission_id: signature.transmissionId,
        transmission_sig: signature.transmissionSig,
        transmission_time: signature.transmissionTime,
        webhook_id: webhookId,
        webhook_event: event,
      },
    );
    return result.verification_status === "SUCCESS";
  }
}

async function toError(response: Response): Promise<PayPalError> {
  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    // Not JSON: keep the status alone.
  }
  return new PayPalError(
    response.status,
    String(data.name ?? data.error ?? `HTTP_${response.status}`),
    String(data.message ?? data.error_description ?? response.statusText),
    (data.debug_id as string | undefined) ?? response.headers.get("paypal-debug-id") ?? null,
    data.details ?? null,
  );
}
