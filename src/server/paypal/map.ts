import type { Address, DisputeReason, DisputeStage, ProtectionStatus } from "@/lib/domain";
import { toCents, type Cents } from "@/lib/money";
import type { Dispute, DisputeReasonCode, Order, PayPalAddress } from "./types";

/** PayPal's reason codes, in Truce's terms. */
export function reasonOf(code: DisputeReasonCode): DisputeReason {
  switch (code) {
    case "MERCHANDISE_OR_SERVICE_NOT_RECEIVED":
      return "not_received";
    case "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED":
      return "not_as_described";
    case "UNAUTHORISED":
      return "unauthorized";
    default:
      return "other";
  }
}

/** Inquiry while it's still a conversation; a claim once PayPal decides; a chargeback from a card. */
export function stageOf(
  dispute: Pick<Dispute, "dispute_life_cycle_stage" | "dispute_channel">,
): DisputeStage {
  if (dispute.dispute_channel === "EXTERNAL") return "chargeback";
  return dispute.dispute_life_cycle_stage === "INQUIRY" ? "inquiry" : "claim";
}

export function addressOf(a: PayPalAddress | undefined): Address | null {
  if (!a?.address_line_1) return null;
  return {
    line1: a.address_line_1,
    line2: a.address_line_2,
    city: a.admin_area_2 ?? "",
    state: a.admin_area_1 ?? "",
    postalCode: a.postal_code ?? "",
    country: a.country_code,
  };
}

export interface CapturedOrder {
  orderId: string;
  captureId: string | null;
  amount: Cents;
  protection: ProtectionStatus | null;
  /** Covered dispute kinds, such as ITEM_NOT_RECEIVED and UNAUTHORIZED_TRANSACTION. */
  protectedAgainst: string[];
  paypalAddress: Address | null;
  shipToName: string | null;
  payerEmail: string | null;
}

/** The facts Truce keeps from a captured PayPal order. */
export function capturedOrder(order: Order): CapturedOrder {
  const unit = order.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  return {
    orderId: order.id,
    captureId: capture?.id ?? null,
    amount: toCents(capture?.amount.value ?? unit?.amount?.value ?? "0"),
    protection: capture?.seller_protection?.status ?? null,
    protectedAgainst: capture?.seller_protection?.dispute_categories ?? [],
    paypalAddress: addressOf(unit?.shipping?.address),
    shipToName: unit?.shipping?.name?.full_name ?? null,
    payerEmail: order.payer?.email_address ?? null,
  };
}
