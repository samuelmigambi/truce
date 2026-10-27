import type { Address, DisputeReason, OrderFacts } from "../domain";

/**
 * PayPal's US Seller Protection (policy updated 26 Jan 2026): it covers "item not received" and
 * "unauthorized" claims, never "not as described", and only when the order shipped to the address
 * on the Transaction Details page with proof of shipment or delivery.
 */

/** Orders at or above this need signature confirmation. The US figure is unverified, so it's off. */
export const SIGNATURE_THRESHOLD: number | null = null;

export type CheckId = "reason" | "eligibility" | "address" | "tracking" | "delivery" | "signature";

export interface Check {
  id: CheckId;
  ok: boolean;
  label: string;
}

export interface ProtectionResult {
  covered: boolean;
  checks: Check[];
}

const SHORT: Record<string, string> = {
  street: "st",
  avenue: "ave",
  road: "rd",
  boulevard: "blvd",
  drive: "dr",
  lane: "ln",
  court: "ct",
  place: "pl",
  apartment: "apt",
  suite: "ste",
  north: "n",
  south: "s",
  east: "e",
  west: "w",
};

const words = (text: string | undefined) =>
  (text ?? "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SHORT[w] ?? w)
    .join(" ");

const postal = (a: Address) =>
  a.country.toUpperCase() === "US" ? a.postalCode.trim().slice(0, 5) : words(a.postalCode);

/** Whether two addresses are the same place, ignoring case, punctuation and common abbreviations. */
export function sameAddress(a: Address, b: Address): boolean {
  return (
    a.country.toUpperCase() === b.country.toUpperCase() &&
    postal(a) === postal(b) &&
    words(a.state) === words(b.state) &&
    words(a.city) === words(b.city) &&
    words(a.line1) === words(b.line1) &&
    words(a.line2) === words(b.line2)
  );
}

function addressCheck(order: OrderFacts): Check {
  if (!order.paypalAddress || !order.shipTo) {
    return { id: "address", ok: false, label: "No shipping address to compare with PayPal's" };
  }
  return sameAddress(order.paypalAddress, order.shipTo)
    ? { id: "address", ok: true, label: "Ships to the address on PayPal's Transaction Details" }
    : {
        id: "address",
        ok: false,
        label: "The label address differs from PayPal's, which voids Seller Protection",
      };
}

function signatureCheck(order: OrderFacts): Check | null {
  if (SIGNATURE_THRESHOLD === null || order.amount < SIGNATURE_THRESHOLD) return null;
  return order.tracking?.signedFor
    ? { id: "signature", ok: true, label: "Signed for on delivery" }
    : { id: "signature", ok: false, label: "Orders this size need signature confirmation" };
}

/** Before an order ships: what would keep it protected, and what would void it. */
export function shippingChecks(order: OrderFacts): ProtectionResult {
  const checks: Check[] = [
    order.protection === "NOT_ELIGIBLE" || order.protection === null
      ? { id: "eligibility", ok: false, label: "PayPal marks this payment not eligible" }
      : { id: "eligibility", ok: true, label: "PayPal marks this payment eligible" },
    addressCheck(order),
  ];
  const signature = signatureCheck(order);
  if (signature) checks.push(signature);
  return { covered: checks.every((c) => c.ok), checks };
}

/** Whether Seller Protection covers a dispute on this order, check by check. */
export function caseProtection(reason: DisputeReason, order: OrderFacts): ProtectionResult {
  const checks: Check[] = [];
  const coveredReason = reason === "not_received" || reason === "unauthorized";
  checks.push(
    coveredReason
      ? { id: "reason", ok: true, label: "Seller Protection covers this kind of claim" }
      : { id: "reason", ok: false, label: "Seller Protection never covers this kind of claim" },
  );

  const eligible =
    order.protection === "ELIGIBLE" ||
    (order.protection === "PARTIALLY_ELIGIBLE" && reason === "not_received");
  checks.push(
    eligible
      ? { id: "eligibility", ok: true, label: "PayPal marked the payment eligible" }
      : { id: "eligibility", ok: false, label: "PayPal didn't mark the payment eligible for this" },
  );

  checks.push(addressCheck(order));

  const uploaded = order.tracking?.uploaded ?? false;
  checks.push(
    uploaded
      ? { id: "tracking", ok: true, label: "Tracking was added to the PayPal order" }
      : { id: "tracking", ok: false, label: "No tracking on the PayPal order" },
  );
  if (reason === "not_received") {
    checks.push(
      order.tracking?.deliveredAt
        ? { id: "delivery", ok: true, label: "Tracking shows it was delivered" }
        : { id: "delivery", ok: false, label: "No proof of delivery yet" },
    );
  }

  const signature = signatureCheck(order);
  if (signature) checks.push(signature);
  return { covered: checks.every((c) => c.ok), checks };
}
