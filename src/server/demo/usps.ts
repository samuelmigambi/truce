import type { TrackingEvent } from "@/lib/domain";
import type { City } from "./places";
import type { Rng } from "./rng";

/**
 * Simulated USPS Ground Advantage scans from the shop in Portland, Oregon, worded as USPS words
 * them and routed through real USPS plants. Only the demo uses these; live tracking goes to PayPal.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const ORIGIN = {
  postOffice: "PORTLAND, OR 97202",
  acceptance: "PORTLAND, OR 97215",
  plant: "PORTLAND OR DISTRIBUTION CENTER",
} as const;

export type DeliveredAt = "mailbox" | "porch" | "locker" | "individual" | "mailroom";

const DELIVERED: Record<DeliveredAt, string> = {
  mailbox: "Delivered, In/At Mailbox",
  porch: "Delivered, Front Door/Porch",
  locker: "Delivered, Parcel Locker",
  individual: "Delivered, Left with Individual",
  mailroom: "Delivered to Agent, Front Desk/Reception/Mail Room",
};

/** A Ground Advantage tracking number: 22 digits starting 9400 1, with USPS's mod-10 check digit. */
export function uspsNumber(rng: Rng): string {
  let body = "94001118992";
  while (body.length < 21) body += String(rng.int(0, 9));
  return body + checkDigit(body);
}

/** USPS's mod-10: from the right, weights of 3 and 1 in turn. */
export function checkDigit(digits: string): string {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const digit = Number(digits[digits.length - 1 - i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return String((10 - (sum % 10)) % 10);
}

export interface ShipmentPlan {
  /** When the label was printed in Portland. */
  labelAt: number;
  city: City;
  /** When it's delivered; null when it never arrives. */
  deliverAt: number | null;
  deliveredAt?: DeliveredAt;
  /** A late scan on the way, or a missent parcel that stops dead at `troubleAt`. */
  trouble?: "late" | "missent";
  troubleAt?: number;
  /** Where a missent parcel ended up. */
  missentTo?: string;
  /** The plants on the way, when the parcel doesn't take the usual route. */
  route?: string[];
}

/** Every scan for a shipment, oldest first, including any still in the future. */
export function scanHistory(rng: Rng, plan: ShipmentPlan): TrackingEvent[] {
  const { city } = plan;
  const local = `${city.city.toUpperCase()}, ${city.state} ${city.zip}`;
  const events: TrackingEvent[] = [];
  const add = (at: number, status: TrackingEvent["status"], location: string, detail: string) =>
    events.push({
      at: new Date(Math.round(at / MINUTE) * MINUTE).toISOString(),
      status,
      location,
      detail,
    });

  add(
    plan.labelAt,
    "label_created",
    ORIGIN.postOffice,
    "Shipping Label Created, USPS Awaiting Item",
  );
  const accepted = plan.labelAt + rng.int(4, 8) * HOUR + rng.int(0, 59) * MINUTE;
  if (rng.chance(0.5)) add(accepted, "accepted", ORIGIN.postOffice, "USPS picked up item");
  else add(accepted, "accepted", ORIGIN.acceptance, "Accepted at USPS Origin Facility");
  const atOrigin = accepted + rng.int(2, 4) * HOUR + rng.int(0, 59) * MINUTE;
  add(atOrigin, "in_transit", ORIGIN.plant, "Arrived at USPS Regional Origin Facility");
  const leftOrigin = atOrigin + rng.int(3, 6) * HOUR + rng.int(0, 59) * MINUTE;
  add(leftOrigin, "in_transit", ORIGIN.plant, "Departed USPS Regional Facility");

  // A delivered parcel reaches the buyer's plant the day before; the network plants before it
  // are spread over the days in between. A parcel that never arrives stops where it went astray.
  const delivered = plan.deliverAt !== null;
  const end = delivered
    ? postOfficeArrival(plan.deliverAt!, city)
    : (plan.troubleAt ?? leftOrigin + 4 * DAY);
  const atPlant =
    delivered && !plan.route ? Math.max(leftOrigin + 2 * HOUR, end - rng.int(14, 26) * HOUR) : null;
  const hubs = plan.route ?? (atPlant !== null ? city.via : [...city.via, city.plant]);
  const until = atPlant ?? end;
  const slot = Math.max(HOUR * 4, until - leftOrigin) / (hubs.length + 1);
  hubs.forEach((plant, i) => {
    const arrived = leftOrigin + slot * (i + 0.7) + rng.int(0, 90) * MINUTE;
    if (plan.trouble === "missent" && plan.troubleAt !== undefined && arrived >= plan.troubleAt)
      return;
    add(arrived, "in_transit", plant, "Arrived at USPS Regional Facility");
    const departed = arrived + rng.int(3, 7) * HOUR + rng.int(0, 59) * MINUTE;
    if (departed < until) add(departed, "in_transit", plant, "Departed USPS Regional Facility");
  });
  if (atPlant !== null) {
    add(atPlant, "in_transit", city.plant, "Arrived at USPS Regional Destination Facility");
    const departed = atPlant + rng.int(3, 7) * HOUR + rng.int(0, 59) * MINUTE;
    if (departed < end - HOUR)
      add(departed, "in_transit", city.plant, "Departed USPS Regional Facility");
  }

  if (plan.trouble === "late") {
    const at = plan.troubleAt ?? leftOrigin + (until - leftOrigin) / 2;
    add(at, "in_transit", "", "In Transit to Next Facility, Arriving Late");
  }
  if (plan.trouble === "missent" && plan.troubleAt !== undefined) {
    add(
      plan.troubleAt,
      "exception",
      plan.missentTo ?? ORIGIN.plant,
      "Missent: your package was sent to the wrong facility and is being rerouted",
    );
  }
  // USPS reports a moving parcel about once a day, even between plants; running late, it says so.
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  for (let i = 1; i < sorted.length; i++) {
    let gapStart = Date.parse(sorted[i - 1]!.at);
    const gapEnd = Math.min(Date.parse(sorted[i]!.at), end);
    const late = sorted[i]!.status === "exception";
    while (gapEnd - gapStart > 30 * HOUR) {
      gapStart += rng.int(20, 26) * HOUR + rng.int(0, 59) * MINUTE;
      if (gapEnd - gapStart < 4 * HOUR) break;
      add(
        gapStart,
        "in_transit",
        "",
        late ? "In Transit to Next Facility, Arriving Late" : "In Transit to Next Facility",
      );
    }
  }

  if (plan.deliverAt !== null) {
    const postOffice = postOfficeArrival(plan.deliverAt, city);
    add(postOffice, "in_transit", local, "Arrived at Post Office");
    const out = Math.min(plan.deliverAt - 20 * MINUTE, postOffice + rng.int(70, 150) * MINUTE);
    add(out, "out_for_delivery", local, "Out for Delivery");
    add(plan.deliverAt, "delivered", local, DELIVERED[plan.deliveredAt ?? "mailbox"]);
  }
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

/** Parcels reach the buyer's post office early on the morning of delivery, local time. */
function postOfficeArrival(deliverAt: number, city: City): number {
  const offset = city.utcOffset * HOUR;
  const localMidnight = Math.floor((deliverAt + offset) / DAY) * DAY - offset;
  const arrival = localMidnight + 5 * HOUR + 40 * MINUTE;
  return Math.min(arrival, deliverAt - 2 * HOUR);
}

/** A delivery time on a given day: mid-morning to late afternoon at the buyer's address. */
export function deliveryTime(rng: Rng, day: number, city: City): number {
  const offset = city.utcOffset * HOUR;
  const localMidnight = Math.floor((day + offset) / DAY) * DAY - offset;
  return localMidnight + rng.int(10, 17) * HOUR + rng.int(0, 59) * MINUTE;
}
