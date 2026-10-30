import "server-only";

import { POLICIES, type Product } from "@/lib/catalog";
import type {
  Address,
  Case,
  CaseEvent,
  EvidenceKind,
  EvidenceRecord,
  Order,
  PolicySource,
  Shop,
} from "@/lib/domain";
import { formatMoney } from "@/lib/money";
import { sameAddress } from "@/lib/rules/protection";
import { formatDay, formatDayTime } from "../dates";
import { closedSummary } from "../embeddings";
import type { PromptRecord } from "../prompts";
import { clean } from "../safety";
import type { ShopLocale } from "../shop";
import { nameWords } from "../web";

/**
 * Evidence records, written by code from the shop's own data: the model reads them and cites
 * them, but never writes them, so a record can't say something the data doesn't. IDs (E1, E2…)
 * are given once the file is complete, in a fixed order by kind, so they read the same every run.
 * Dates are on the shop's calendar and money is in its currency.
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

/** "1400 J St, Apt 512, Sacramento, CA 95814"; parts an address doesn't have are left out. */
export function addressLine(a: Address | null): string {
  if (!a) return "no address on file";
  const place = [a.city, [a.state, a.postalCode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [a.line1, a.line2, place].filter(Boolean).join(", ");
}

const PROTECTION_LABEL = {
  ELIGIBLE: "eligible",
  PARTIALLY_ELIGIBLE: "partially eligible (item not received only)",
  NOT_ELIGIBLE: "not eligible",
} as const;

export function orderRecords(order: Order, shop: ShopLocale & Pick<Shop, "name">): NewRecord[] {
  const money = (cents: number) => formatMoney(cents, shop.currency);
  const items = order.items
    .map((i) => `${i.quantity} × ${i.name} at ${money(i.unitPrice)}`)
    .join(", ");
  const records: NewRecord[] = [
    {
      kind: "order",
      title: `Order ${order.id}`,
      summary: `${items}; ${money(order.amount)} in total, placed ${formatDay(order.placedAt, shop.timeZone)} by ${order.buyer.name}. The label ships to ${addressLine(order.shipTo)}.`,
      source: `${shop.name} order ${order.id}`,
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
    summary: `Paid ${money(order.amount)} through PayPal${order.captureId ? ` (capture ${order.captureId})` : ""}. PayPal's Seller Protection status for this payment: ${status}. The address on PayPal's Transaction Details: ${addressLine(order.paypalAddress)}${where}.`,
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
      source: `${shop.name} order ${order.id}`,
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

/**
 * The parcel's tracking: every scan Truce has, or, for a real shop (no carrier feed), the
 * tracking number with what PayPal's tracker records.
 */
export function trackingRecord(order: Order, timeZone: string): NewRecord | null {
  const t = order.tracking;
  if (!t) return null;
  const day = (iso: string) => formatDay(iso, timeZone);
  const events = [...(t.events ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  const last = events.at(-1);
  const where = (location: string) => (location.trim() ? ` in ${titleCasePlace(location)}` : "");
  const scans = events
    .slice(-6)
    .map((e) => `${day(e.at)}: ${e.status.replaceAll("_", " ")}${where(e.location)} (${e.detail})`)
    .join("; ");
  const final = last?.status === "delivered" ? last : null;
  const delivered = t.deliveredAt
    ? `Delivered ${formatDayTime(t.deliveredAt, timeZone)}${final ? `${where(final.location)} (${final.detail})` : ""}${t.signedFor ? ", signed for" : ""}.`
    : last
      ? `Not delivered. The last scan was on ${day(last.at)}: ${last.status.replaceAll("_", " ")} (${last.detail}).`
      : "Truce has no carrier scans for this parcel, only its tracking number.";
  const paypal = [
    t.shippedAt ? `PayPal records it shipped on ${day(t.shippedAt)}.` : "",
    t.paypalStatus
      ? `PayPal's tracker status: ${t.paypalStatus.toLowerCase().replaceAll("_", " ")}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    kind: "tracking",
    title: `${t.carrier} tracking ${t.number}`,
    summary: `${delivered}${scans ? ` Scans: ${scans}.` : ""}${paypal ? ` ${paypal}` : ""} ${t.uploaded ? "The tracking number was added to the PayPal order." : "The tracking number was not added to the PayPal order."}`,
    source: `${t.carrier} ${t.number}`,
    at: t.deliveredAt ?? last?.at ?? t.shippedAt ?? undefined,
  };
}

const squash = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Where a record copied from the sample catalog came from, and why it isn't the live page. */
function catalogSource(what: string, page: { url: string } | null, shopName: string): string {
  return page
    ? `${shopName} catalog copy of the ${what} (${page.url} didn't show these lines when read)`
    : `${shopName} catalog copy of the ${what} (the live page couldn't be read)`;
}

/**
 * The sample shop's listing as the buyer saw it. When the live page could be read, its source is
 * the page and the stated details are checked against it; otherwise the record says it's the
 * catalog's copy.
 */
export function listingRecord(
  product: Product,
  page: { url: string; content: string } | null,
  shopName: string,
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
    source: fromPage ? page.url : catalogSource("listing", page, shopName),
  };
}

export type PolicyTopic = keyof typeof POLICIES;

/** The sample shop's policy, from the catalog, checked against its live page when it was read. */
export function policyRecord(
  topic: PolicyTopic,
  page: { url: string; content: string } | null,
  shopName: string,
): NewRecord {
  const lines = POLICIES[topic];
  const text = page ? squash(page.content) : "";
  const fromPage = page !== null && lines.some((line) => text.includes(squash(line).slice(0, 60)));
  return {
    kind: "policy",
    title: topic === "shipping" ? "Shop policy: shipping" : "Shop policy: returns and damage",
    summary: lines.join(" "),
    source: fromPage ? page.url : catalogSource("policies", page, shopName),
  };
}

// ---------- A real shop's own pages and settings ----------

/** Page text as plain lines: markdown links, images, headings, bullets and emphasis taken out. */
export function plainLines(markdown: string): string[] {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^\|+|\|+$/g, "")
        .replace(/\s*\|\s*/g, " · ")
        .replace(/^(?:#{1,6}|[-*+•>]|\d+[.)])\s+/, "")
        .replace(/\*\*|__|`|\*/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((line) => /[\p{L}\p{N}]/u.test(line));
}

const DETAIL_WORDS =
  /\b(sizes?|sized|dimensions?|measures?|measurements?|width|wide|height|tall|length|long|depth|deep|diameter|weight|weighs|materials?|made (?:of|from|with)|fabric|capacity|volume|holds|colou?rs?|finish|includes)\b/i;
const MEASUREMENT =
  /\d\s?(?:(?:in|inch(?:es)?|cm|mm|ft|feet|oz|ml|litres?|liters?|kg|g|lbs?)\b|["″]|(?:×|x)\s?\d)/i;
/** "Material: cotton", "Made from soy": a detail stated, not just mentioned ("check the size"). */
const STATED = /^[^:]{2,30}:\s*\S|\bmade (?:of|from|with)\b/i;
/** A shop page's buttons and boilerplate, which say nothing about the item. */
const PAGE_CHROME =
  /^(add to (cart|bag|basket)|buy (it )?now|quantity|qty|sold out|in stock|out of stock|share|tweet|pin it|write a review|reviews?|skip to content|menu|search|log in|sign in|cart)$/i;

const sentence = (line: string) => (/[.!?:;…]$/.test(line) ? line : `${line}.`);

/** The page's lines that say something about the item: the shop's buttons and menus taken out. */
function contentLines(lines: string[]): string[] {
  return lines.filter((line) => !PAGE_CHROME.test(line.replace(/[.!]+$/, "").trim()));
}

/** Text from outside cut to `max` characters at a word, tidied like any untrusted text. */
function cut(text: string, max: number): string {
  const tidy = clean(text, 20_000);
  if (tidy.length <= max) return tidy;
  const slice = tidy.slice(0, max);
  const space = slice.lastIndexOf(" ");
  return `${(space > max * 0.6 ? slice.slice(0, space) : slice).replace(/[\s.,;:]+$/, "")}…`;
}

/** Up to `max` lines that state a measurement, or a size, material or other detail. */
export function statedDetails(lines: string[], max = 6): string[] {
  const picked: string[] = [];
  for (const line of lines) {
    if (line.length > 240) continue;
    if (!MEASUREMENT.test(line) && !(DETAIL_WORDS.test(line) && STATED.test(line))) continue;
    const detail = cut(line, 160).replace(/[.;,]+$/, "");
    if (picked.includes(detail)) continue;
    picked.push(detail);
    if (picked.length >= max) break;
  }
  return picked;
}

/** A few hundred characters of the page, from where it first names the item. */
function excerptOf(lines: string[], name: string, max = 400): string {
  const words = nameWords(name);
  const names = (line: string) => {
    const lower = line.toLowerCase();
    return words.filter((w) => lower.includes(w)).length >= Math.ceil(words.length / 2);
  };
  const start = words.length ? Math.max(0, lines.findIndex(names)) : 0;
  let text = "";
  for (const line of lines.slice(start)) {
    text = text ? `${text} ${sentence(line)}` : sentence(line);
    if (text.length >= max) break;
  }
  return cut(text, max);
}

/**
 * A real shop's listing, written by code from its own page: the item's name, a short excerpt and
 * the lines that state sizes, materials and other details. The page is the shop's, but its text
 * came from the web, so it's fenced like any outside text. Null for a page with no text.
 */
export function siteListingRecord(
  itemName: string,
  page: { url: string; content: string },
  host: string,
): NewRecord | null {
  const lines = contentLines(plainLines(page.content));
  if (lines.length === 0) return null;
  const name = clean(itemName, 120);
  const details = statedDetails(lines);
  return {
    kind: "listing",
    title: `Listing: ${name}, as shown on ${host}`,
    summary: [
      `The shop's page for ${name} reads: ${excerptOf(lines, itemName)}`,
      details.length
        ? `The lines on it that state details: ${details.join("; ")}.`
        : "The page states no sizes, materials or other details.",
    ].join(" "),
    source: page.url,
    untrusted: "web",
  };
}

const REAL_POLICY_TITLE: Record<PolicyTopic, string> = {
  shipping: "Shop policy: shipping",
  returns: "Shop policy: returns",
};

/** A real shop's policy as the seller wrote it in Truce's settings, with its page if it has one. */
export function policyTextRecord(topic: PolicyTopic, policy: PolicySource): NewRecord {
  const source = "Shop policy, as given in Truce settings";
  return {
    kind: "policy",
    title: REAL_POLICY_TITLE[topic],
    summary: cut(policy.text, 2000),
    source: policy.url ? `${source} (${policy.url})` : source,
  };
}

const TOPIC_WORDS: Record<PolicyTopic, RegExp> = {
  shipping:
    /\b(ship|ships|shipping|shipped|deliver|delivery|delivered|dispatch|dispatched|postage|tracking|courier|carrier)\b/i,
  returns:
    /\b(return|returns|returned|refund|refunds|refunded|exchange|exchanges|damaged?|broken|faulty|defective|replace|replacement)\b/i,
};

/** A markdown heading, or a short line that's bold on its own, which pages use as one. */
const HEADING = /^\s*(?:#{1,6}\s|\*\*[^*]{1,80}\*\*\s*$)/;

/**
 * The part of a policies page about one topic: the sections whose heading names it and any other
 * line that does, or the start of the page when nothing does.
 */
export function policyText(markdown: string, topic: PolicyTopic, max = 1500): string {
  const words = TOPIC_WORDS[topic];
  const picked: string[] = [];
  const all: string[] = [];
  let inSection = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const [line] = plainLines(raw);
    if (!line) continue;
    all.push(line);
    if (HEADING.test(raw)) {
      inSection = words.test(line);
      if (inSection) picked.push(line);
    } else if (inSection || words.test(line)) {
      picked.push(line);
    }
  }
  return cut((picked.length ? picked : all).map(sentence).join(" "), max);
}

/** A real shop's policy read from the page its settings point to, fenced as web text. */
export function policyPageRecord(
  topic: PolicyTopic,
  page: { url: string; content: string },
): NewRecord | null {
  const summary = policyText(page.content, topic);
  if (!summary) return null;
  return {
    kind: "policy",
    title: REAL_POLICY_TITLE[topic],
    summary,
    source: page.url,
    untrusted: "web",
  };
}

// ---------- The dispute itself ----------

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

export function historyRecord(kase: Case, events: CaseEvent[], shop: ShopLocale): NewRecord {
  const notes = closingNotes(kase, events);
  const day = (iso: string) => formatDay(iso, shop.timeZone);
  return {
    kind: "history",
    title: `Past case: ${kase.itemSummary} (${kase.outcome ?? "closed"})`,
    summary: `${closedSummary(kase, shop.currency)} Opened ${day(kase.openedAt)}${kase.closedAt ? `, closed ${day(kase.closedAt)}` : ""}.${notes.text ? ` ${notes.text}` : ""}`,
    source: `Truce case ${kase.id}`,
    at: kase.closedAt ?? kase.openedAt,
    // PayPal's own words are quoted, so the record is read as data.
    ...(notes.fromPayPal ? { untrusted: "paypal" as const } : {}),
  };
}
