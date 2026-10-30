import { describe, expect, it } from "vitest";
import { dayLabel, formatDate, formatDateTime, shortId, timeAgo } from "./format";
import {
  paypalCall,
  reviewAction,
  sendBlocker,
  shopState,
  tidyPlace,
  trackingBlocker,
} from "./labels";
import type { PayPalConnection } from "@/lib/domain";

const HOUR = 60 * 60 * 1000;

describe("dates in the shop's time zone", () => {
  // 03:30 UTC on 29 Oct is still 28 Oct in Los Angeles, and already 29 Oct in Kigali.
  const instant = "2026-10-29T03:30:00.000Z";
  const now = Date.parse("2026-10-29T12:00:00.000Z");

  it("puts an instant on the shop's own calendar day", () => {
    expect(formatDate(instant, now, "America/Los_Angeles")).toBe("Oct 28");
    expect(formatDate(instant, now, "Africa/Kigali")).toBe("Oct 29");
  });

  it("writes the time in the zone too", () => {
    expect(formatDateTime(instant, now, "Africa/Kigali")).toBe("Oct 29, 5:30 AM");
  });

  it("counts today and yesterday in the shop's days, not the browser's", () => {
    expect(dayLabel(instant, now, "Africa/Kigali")).toBe("Today");
    expect(dayLabel(instant, now, "America/Los_Angeles")).toBe("Yesterday");
  });

  it("adds the year only outside the current one", () => {
    expect(formatDate("2025-03-02T18:00:00.000Z", now, "UTC")).toBe("Mar 2, 2025");
  });

  it("falls back to UTC for a zone it doesn't know", () => {
    expect(formatDate(instant, now, "Not/AZone")).toBe("Oct 29");
  });

  it("says how long ago, then the date", () => {
    expect(timeAgo(new Date(now - 30_000).toISOString(), now, "UTC")).toBe("Just now");
    expect(timeAgo(new Date(now - 3 * HOUR).toISOString(), now, "UTC")).toBe("3 hours ago");
    expect(timeAgo(new Date(now - 30 * HOUR).toISOString(), now, "UTC")).toBe("Yesterday");
    expect(timeAgo("2026-10-01T12:00:00.000Z", now, "UTC")).toBe("Oct 1");
  });

  it("shortens long IDs and leaves short ones", () => {
    expect(shortId("AbCdEfGhIjKlMnOpQrSt")).toBe("AbCdEf…QrSt");
    expect(shortId("short")).toBe("short");
  });

  it("writes carrier places in title case, keeping state codes", () => {
    expect(tidyPlace("SACRAMENTO, CA 95814")).toBe("Sacramento, CA 95814");
    expect(tidyPlace("JACKSONVILLE FL DISTRIBUTION CENTER")).toBe(
      "Jacksonville FL Distribution Center",
    );
    expect(tidyPlace("LA CROSSE WI")).toBe("La Crosse WI");
    expect(tidyPlace("Already tidy, OR")).toBe("Already tidy, OR");
  });
});

const connection = (patch: Partial<PayPalConnection> = {}): PayPalConnection => ({
  environment: "sandbox",
  clientId: "AbCdEfGhIjKlMnOpQrStUvWx",
  clientIdHash: "hash",
  appId: null,
  features: { disputes: true, respond: true, transactions: true, tracking: true, webhooks: true },
  webhook: { status: "registered", id: "WH-1", url: "https://example.com/hook", note: null },
  connectedAt: "2026-10-29T08:00:00.000Z",
  checkedAt: "2026-10-29T08:00:00.000Z",
  health: "ok",
  problem: null,
  ...patch,
});

describe("how a shop stands with PayPal", () => {
  it("names each kind of shop", () => {
    expect(shopState({ kind: "sample", paypal: null }).label).toBe("Sample shop");
    expect(shopState({ kind: "real", paypal: null }).label).toBe("PayPal not connected");
    expect(
      shopState({ kind: "real", paypal: { environment: "sandbox", health: "ok" } }).label,
    ).toBe("PayPal sandbox");
    expect(shopState({ kind: "real", paypal: { environment: "live", health: "ok" } }).label).toBe(
      "PayPal live",
    );
    expect(
      shopState({ kind: "real", paypal: { environment: "live", health: "error" } }).label,
    ).toBe("PayPal needs attention");
  });

  it("lets a sample shop approve, and a real one only when PayPal can answer", () => {
    expect(sendBlocker({ kind: "sample", paypal: null })).toBeNull();
    expect(sendBlocker({ kind: "real", paypal: connection() })).toBeNull();
    expect(sendBlocker({ kind: "real", paypal: null })).toMatch(/Connect PayPal/);
    expect(sendBlocker({ kind: "real", paypal: connection({ health: "error" }) })).toMatch(
      /needs attention/,
    );
    const mute = connection({
      features: {
        disputes: true,
        respond: false,
        transactions: true,
        tracking: true,
        webhooks: true,
      },
    });
    expect(sendBlocker({ kind: "real", paypal: mute })).toMatch(/can't answer disputes/);
  });

  it("only adds tracking where the app allows it", () => {
    const noTracking = connection({
      features: {
        disputes: true,
        respond: true,
        transactions: true,
        tracking: false,
        webhooks: true,
      },
    });
    expect(trackingBlocker({ kind: "real", paypal: noTracking })).toMatch(/can't add tracking/);
    expect(trackingBlocker({ kind: "real", paypal: connection() })).toBeNull();
  });

  const inquiry = { stage: "inquiry", status: "needs_you", paypalDisputeId: "PP-D-1" } as const;
  const claim = { stage: "claim", status: "needs_you", paypalDisputeId: "PP-D-1" } as const;
  const reviewing = {
    stage: "claim",
    status: "with_paypal",
    paypalDisputeId: "PP-D-1",
    paypalActions: ["provide_supporting_info", "accept_claim"],
  } as const;

  it("names the PayPal call each move makes, as the server does", () => {
    expect(paypalCall("fight", inquiry).path).toBe("/v1/customer/disputes/PP-D-1/send-message");
    expect(paypalCall("settle", inquiry).name).toBe("make-offer");
    expect(paypalCall("fight", claim).name).toBe("provide-evidence");
    expect(paypalCall("refund", claim).name).toBe("accept-claim");
    expect(
      paypalCall("fight", { ...reviewing, paypalActions: [...reviewing.paypalActions] }).name,
    ).toBe("provide-supporting-info");
  });

  it("lets a real shop still answer a claim PayPal is reviewing, when PayPal allows it", () => {
    const actions = [...reviewing.paypalActions];
    expect(reviewAction({ kind: "real" }, { ...reviewing, paypalActions: actions }, "fight")).toBe(
      "provide_supporting_info",
    );
    expect(reviewAction({ kind: "real" }, { ...reviewing, paypalActions: actions }, "refund")).toBe(
      "accept_claim",
    );
    expect(reviewAction({ kind: "real" }, { ...reviewing, paypalActions: [] }, "fight")).toBeNull();
    expect(
      reviewAction({ kind: "sample" }, { ...reviewing, paypalActions: actions }, "fight"),
    ).toBeNull();
    expect(reviewAction({ kind: "real" }, claim, "fight")).toBeNull();
  });
});
