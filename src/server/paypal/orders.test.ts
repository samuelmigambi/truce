import { describe, expect, it } from "vitest";
import type { Order } from "@/lib/domain";
import { isSale, mergeOrder, orderFromTransaction, searchWindows } from "./orders";
import type { Transaction } from "./types";

const sale = (overrides: Partial<Transaction["transaction_info"]> = {}): Transaction => ({
  transaction_info: {
    transaction_id: "5TY05013RG002845M",
    transaction_event_code: "T0006",
    transaction_initiation_date: "2026-10-20T15:04:00+0000",
    transaction_amount: { currency_code: "USD", value: "64.00" },
    transaction_status: "S",
    invoice_id: "HF-2041",
    ...overrides,
  },
  payer_info: {
    email_address: "ana@example.com",
    payer_name: { given_name: "Ana", surname: "Lima" },
  },
  shipping_info: {
    name: "Ana Lima",
    address: {
      line1: "12 Elm St",
      city: "Austin",
      state: "TX",
      postal_code: "78701",
      country_code: "US",
    },
  },
  cart_info: {
    item_details: [
      {
        item_name: "Speckled mug",
        item_quantity: "2",
        item_unit_price: { currency_code: "USD", value: "32.00" },
      },
    ],
  },
});

describe("Transaction Search", () => {
  it("covers the last 90 days in windows of at most 31 days", () => {
    const now = Date.parse("2026-10-29T12:00:00.000Z");
    const windows = searchWindows(now);
    expect(windows).toHaveLength(3);
    expect(windows[0]!.endDate).toBe("2026-10-29T12:00:00-0000");
    for (const w of windows) {
      expect(
        Date.parse(w.endDate.replace("-0000", "Z")) - Date.parse(w.startDate.replace("-0000", "Z")),
      ).toBeLessThanOrEqual(31 * 24 * 60 * 60 * 1000);
    }
    expect(windows.at(-1)!.startDate).toBe("2026-07-31T12:00:00-0000");
  });

  it("keeps payments the shop received, not refunds, fees or denied ones", () => {
    expect(isSale(sale())).toBe(true);
    expect(isSale(sale({ transaction_event_code: "T1107" }))).toBe(false);
    expect(isSale(sale({ transaction_amount: { currency_code: "USD", value: "-64.00" } }))).toBe(
      false,
    );
    expect(isSale(sale({ transaction_status: "D" }))).toBe(false);
  });

  it("turns a sale into an order, tracking still unknown", () => {
    expect(orderFromTransaction(sale())).toMatchObject({
      id: "HF-2041",
      captureId: "5TY05013RG002845M",
      paypalOrderId: null,
      buyer: { name: "Ana Lima", email: "ana@example.com" },
      items: [{ name: "Speckled mug", quantity: 2, unitPrice: 3200 }],
      amount: 6400,
      status: "paid",
      paypalAddress: { line1: "12 Elm St", city: "Austin", state: "TX", postalCode: "78701" },
      protection: null,
      tracking: null,
    });
    expect(orderFromTransaction(sale({ invoice_id: undefined })).id).toBe("PP-5TY05013RG002845M");
  });

  it("fills gaps in a stored order without overwriting what Truce knew", () => {
    const fresh = orderFromTransaction(sale());
    const stored: Order = {
      ...fresh,
      protection: "ELIGIBLE",
      tracking: {
        carrier: "USPS",
        number: "9400",
        uploaded: true,
        deliveredAt: null,
        signedFor: false,
        scans: "none",
      },
      paypalAddress: null,
    };
    const merged = mergeOrder(stored, fresh);
    expect(merged.protection).toBe("ELIGIBLE");
    expect(merged.tracking?.number).toBe("9400");
    expect(merged.paypalAddress?.line1).toBe("12 Elm St");
    expect(mergeOrder(undefined, fresh)).toBe(fresh);
  });
});
