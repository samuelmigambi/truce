import "server-only";

import { POLICIES, type Product } from "@/lib/catalog";
import type { Address, Case, CaseEvent, EvidenceKind, EvidenceRecord, Order } from "@/lib/domain";
import { formatUsd } from "@/lib/money";
import { sameAddress } from "@/lib/rules/protection";
import { formatDay, formatDayTime } from "../dates";
import { closedSummary } from "../embeddings";
import type { PromptRecord } from "../prompts";

/**
 * Evidence records, written by code from the shop's own data: the model reads them and cites
 * them, but never writes them, so a record can't say something the data doesn't. IDs (E1, E2…)
 * are given once the file is complete, in a fixed order by kind, so they read the same every run.
 */
export type NewRecord = Omit<PromptRecord, "id">;

const KIND_ORDER: EvidenceKind[] = [
  "order",
  "payment",
  "tracking",
  "listing",
  "policy",
  "message",
  "photo",
  "history",
];

export function numberRecords(records: NewRecord[]): PromptRecord[] {
  const seen = new Set<string>();
  return records
    .filter((r) => {
      const key = `${r.kind}|${r.title}|${r.summary}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r, index) => ({ r, index }))
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.r.kind) - KIND_ORDER.indexOf(b.r.kind) ||
        (a.r.at ?? "").localeCompare(b.r.at ?? "") ||
        a.index - b.index,
    )
    .map(({ r }, i) => ({ id: `E${i + 1}`, ...r }));
}

/** The records as the Analysis keeps them, without the internal untrusted marks. */
export function publicRecords(records: PromptRecord[]): EvidenceRecord[] {
  return records.map(({ id, kind, title, summary, source, at }) => ({
    id,
    kind,
    title,
    summary,
    source,
    ...(at ? { at } : {}),
  }));
}

export function addressLine(a: Address | null): string {
  if (!a) return "no address on file";
  return [a.line1, a.line2, `${a.city}, ${a.state} ${a.postalCode}`].filter(Boolean).join(", ");
}

const PROTECTION_LABEL = {
  ELIGIBLE: "eligible",
  PARTIALLY_ELIGIBLE: "partially eligible (item not received only)",
  NOT_ELIGIBLE: "not eligible",
} as const;

export function orderRecords(order: Order, shopName: string): NewRecord[] {
  const items = order.items
    .map((i) => `${i.quantity} × ${i.name} at ${formatUsd(i.unitPrice)}`)
    .join(", ");
  const records: NewRecord[] = [
    {
      kind: "order",
      title: `Order ${order.id}`,
      summary: `${items}; ${formatUsd(order.amount)} in total, placed ${formatDay(order.placedAt)} by ${order.buyer.name}. The label ships to ${addressLine(order.shipTo)}.`,
      source: `${shopName} order ${order.id}`,
      at: order.placedAt,
    },
  ];

  const matches =
    order.paypalAddress && order.shipTo ? sameAddress(order.paypalAddress, order.shipTo) : null;
  const where =
    matches === null
      ? ""
      : matches
        ? ", the same address the order shipped to"
        : ", which differs from the shipping label's address";
  const status = order.protection ? PROTECTION_LABEL[order.protection] : "not reported";
  records.push({
    kind: "payment",
    title: "PayPal payment",
    summary: `Paid ${formatUsd(order.amount)} through PayPal${order.captureId ? ` (capture ${order.captureId})` : ""}. PayPal's Seller Protection status for this payment: ${status}. The address on PayPal's Transaction Details: ${addressLine(order.paypalAddress)}${where}.`,
    source: order.captureId
      ? `PayPal capture ${order.captureId}`
      : order.paypalOrderId
        ? `PayPal order ${order.paypalOrderId}`
        : "PayPal payment record",
    at: order.placedAt,
  });

  if (order.note?.trim()) {
    records.push({
      kind: "message",
      title: "Buyer's note at checkout",
      summary: order.note,
      source: `${shopName} order ${order.id}`,
      at: order.placedAt,
      untrusted: "buyer",
    });
  }
  return records;
}

const STATES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR VI GU AS MP AA AE AP".split(
    " ",
  ),
);
const ACRONYMS = new Set(["USPS", "UPS", "NDC", "ISC", "P&DC", "P&DF", "LLC", "PO"]);
const SMALL = new Set(["of", "and", "the", "at", "on", "in", "for", "to"]);

/**
 * Carriers write places in capitals ("SACRAMENTO CA DISTRIBUTION CENTER"); the seller reads them
 * in title case ("Sacramento CA Distribution Center"), with state codes and ZIPs as they are.
 */
export function titleCasePlace(place: string): string {
  if (place !== place.toUpperCase()) return place.trim();
  return place
    .trim()
    .split(/(\s+)/)
    .map((word, i) => {
      if (/^\s+$/.test(word)) return word;
      const bare = word.replace(/[^A-Za-z&]/g, "");
      if (/\d/.test(word) || STATES.has(bare) || ACRONYMS.has(bare)) return word;
      const lower = word.toLowerCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      return lower.replace(
        /(^|[-'’/(])([a-z])/g,
        (_m, edge: string, letter: string) => edge + letter.toUpperCase(),
      );
    })
    .join("");
}

export function trackingRecord(order: Order): NewRecord | null {
  const t = order.tracking;
  if (!t) return null;
  const events = [...(t.events ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  const last = events.at(-1);
  const where = (location: string) => (location.trim() ? ` in ${titleCasePlace(location)}` : "");
  const scans = events
    .slice(-6)
    .map(
      (e) =>
        `${formatDay(e.at)}: ${e.status.replaceAll("_", " ")}${where(e.location)} (${e.detail})`,
    )
    .join("; ");
  const final = last?.status === "delivered" ? last : null;
  const delivered = t.deliveredAt
    ? `Delivered ${formatDayTime(t.deliveredAt)}${final ? `${where(final.location)} (${final.detail})` : ""}${t.signedFor ? ", signed for" : ""}.`
    : last
      ? `Not delivered. The last scan was on ${formatDay(last.at)}: ${last.status.replaceAll("_", " ")} (${last.detail}).`
      : "No scans yet.";
  return {
    kind: "tracking",
    title: `${t.carrier} tracking ${t.number}`,
    summary: `${delivered}${scans ? ` Scans: ${scans}.` : ""} ${t.uploaded ? "The tracking number was added to the PayPal order." : "The tracking number was not added to the PayPal order."}`,
    source: `${t.carrier} ${t.number}`,
    at: t.deliveredAt ?? last?.at,
  };
}

const squash = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Where a record copied from the catalog came from, and why it isn't the live page. */
function catalogSource(what: string, page: { url: string } | null): string {
  return page
    ? `Wick & Ember catalog copy of the ${what} (${page.url} didn't show these lines when read)`
    : `Wick & Ember catalog copy of the ${what} (the live page couldn't be read)`;
}

/**
 * The listing as the buyer saw it. When the live page could be read, its source is the page and
 * the stated details are checked against it; otherwise the record says it's the catalog's copy.
 */
export function listingRecord(
  product: Product,
  page: { url: string; content: string } | null,
): NewRecord {
  const details = product.details.map((d) => `${d.label}: ${d.value}`).join("; ");
  const text = page ? squash(page.content) : "";
  const shown = page ? product.details.filter((d) => text.includes(squash(d.value))) : [];
  const fromPage = page !== null && shown.length > 0;
  return {
    kind: "listing",
    title: fromPage
      ? `Listing: ${product.name}, as shown on the live page`
      : `Listing: ${product.name}`,
    summary: `${product.description} The listing states: ${details}.${fromPage && shown.length < product.details.length ? ` The live page showed ${shown.length} of these ${product.details.length} lines when checked.` : ""}`,
    source: fromPage ? page.url : catalogSource("listing", page),
  };
}

export type PolicyTopic = keyof typeof POLICIES;

export function policyRecord(
  topic: PolicyTopic,
  page: { url: string; content: string } | null,
): NewRecord {
  const lines = POLICIES[topic];
  const text = page ? squash(page.content) : "";
  const fromPage = page !== null && lines.some((line) => text.includes(squash(line).slice(0, 60)));
  return {
    kind: "policy",
    title: topic === "shipping" ? "Shop policy: shipping" : "Shop policy: returns and damage",
    summary: lines.join(" "),
    source: fromPage ? page.url : catalogSource("policies", page),
  };
}

export function messageRecords(kase: Case): NewRecord[] {
  const records: NewRecord[] = [
    {
      kind: "message",
      title: "Buyer's claim",
      summary: kase.buyerClaim,
      source: `PayPal dispute ${kase.paypalDisputeId}`,
      at: kase.openedAt,
      untrusted: "buyer",
    },
  ];
  for (const m of kase.messages.slice(-6)) {
    if (m.from === "buyer" && m.text.trim() === kase.buyerClaim.trim()) continue;
    records.push({
      kind: "message",
      title:
        m.from === "buyer"
          ? "Buyer's message"
          : m.from === "seller"
            ? "Seller's message"
            : "PayPal's message",
      summary: m.text,
      source: `PayPal dispute ${kase.paypalDisputeId}`,
      at: m.at,
      untrusted: m.from === "seller" ? undefined : m.from,
    });
  }
  return records;
}

export function photoRecord(
  caption: string,
  url: string,
  reading: string | null,
  at: string,
): NewRecord {
  // Captions often start "Buyer's photo:" already.
  const what = caption.replace(/^\s*buyer'?s photo\s*[:,-]\s*/i, "").trim();
  return {
    kind: "photo",
    title: what ? `Buyer's photo: ${what}` : "Buyer's photo",
    summary: reading
      ? `What the photo shows, as read by the vision model: ${reading}`
      : "The photo couldn't be read, so only its caption is on file.",
    source: url,
    at,
    untrusted: "buyer",
  };
}

const asSentence = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

/**
 * Why a closed case ended the way it did: what the seller sent or offered, how PayPal decided, and
 * PayPal's last word on it.
 */
function closingNotes(kase: Case, events: CaseEvent[]): { text: string; fromPayPal: boolean } {
  const sent = events
    .filter((e) => e.kind === "evidence" || e.kind === "offer")
    .map((e) => (e.detail ? `${e.title}: ${e.detail}` : e.title))
    .slice(-2);
  const decided = events
    .filter((e) => e.kind === "decided")
    .map((e) => e.title)
    .slice(-1);
  const paypal = kase.messages.filter((m) => m.from === "paypal").at(-1)?.text;
  const parts = [...sent, ...decided].map(asSentence);
  if (paypal) parts.push(`PayPal wrote: ${asSentence(paypal)}`);
  return { text: parts.join(" "), fromPayPal: paypal !== undefined };
}

export function historyRecord(kase: Case, events: CaseEvent[]): NewRecord {
  const notes = closingNotes(kase, events);
  return {
    kind: "history",
    title: `Past case: ${kase.itemSummary} (${kase.outcome ?? "closed"})`,
    summary: `${closedSummary(kase)} Opened ${formatDay(kase.openedAt)}${kase.closedAt ? `, closed ${formatDay(kase.closedAt)}` : ""}.${notes.text ? ` ${notes.text}` : ""}`,
    source: `Truce case ${kase.id}`,
    at: kase.closedAt ?? kase.openedAt,
    // PayPal's own words are quoted, so the record is read as data.
    ...(notes.fromPayPal ? { untrusted: "paypal" as const } : {}),
  };
}
