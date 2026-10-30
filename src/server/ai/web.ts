import "server-only";

import { Tavily, type SearchHit } from "@/server/tavily";
import type { WebReader } from "./pipeline/types";

/**
 * The web as evidence. Tavily reads the pages a buyer could see: the sample shop's own pages on
 * this site, or a real shop's listings and policies on the shop's own website. Only public
 * addresses are sent, every request gives up after PAGE_MS, and whatever comes back is fenced as
 * web text by the records that quote it.
 */

/** A page read gives up after this, so a slow site never holds up the analysis. */
export const PAGE_MS = 7_000;

const PRIVATE_IPV4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^0\./,
];

/** Whether Tavily's servers could reach this host: not this machine, a private network or a bare name. */
function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host.includes(":")) return !(host === "::1" || /^(fc|fd|fe8|fe9|fea|feb)/.test(host));
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return !PRIVATE_IPV4.some((range) => range.test(host));
  if (!host.includes(".")) return false;
  return !/\.(localhost|local|internal|lan|home|test|example)$/.test(host);
}

/**
 * The address's public origin for Tavily, or null when it isn't public (local development), so
 * nothing waits on a page Tavily can't reach.
 */
export function publicBase(siteUrl: string | null | undefined): string | null {
  if (!siteUrl) return null;
  try {
    const url = new URL(siteUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return isPublicHost(url.hostname) ? url.origin : null;
  } catch {
    return null;
  }
}

/** A shop's website as Tavily searches it. */
export interface Site {
  /** "wickandember.com", without "www.", for Tavily's include_domains. */
  domain: string;
  /** The path the shop lives under on a shared host ("/shop/lark"), or "" for a whole site. */
  path: string;
}

/** The shop's own site, or null when there's none or it isn't public. */
export function siteOf(website: string | null | undefined): Site | null {
  if (!website || !publicBase(website)) return null;
  const url = new URL(website);
  return {
    domain: url.hostname.toLowerCase().replace(/^www\./, ""),
    path: url.pathname.replace(/\/+$/, "").toLowerCase(),
  };
}

/**
 * Whether a page is on the shop's own site: its domain or a subdomain, and under its path. A shop
 * on a shared host (a marketplace) only owns its own path there, never the other sellers' pages.
 */
export function onSite(url: string, site: Site): boolean {
  try {
    const page = new URL(url);
    if (page.protocol !== "https:" && page.protocol !== "http:") return false;
    const host = page.hostname.toLowerCase();
    if (host !== site.domain && !host.endsWith(`.${site.domain}`)) return false;
    if (!site.path) return true;
    const path = page.pathname.toLowerCase();
    return path === site.path || path.startsWith(`${site.path}/`);
  } catch {
    return false;
  }
}

/**
 * Tavily, with every request cut off at PAGE_MS, so a slow page is reported as unread instead of
 * holding up the analysis. Null without TAVILY_API_KEY.
 */
export function webReader(): WebReader | null {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) return null;
  const timed: typeof fetch = (input, init) =>
    fetch(input, {
      ...init,
      signal: AbortSignal.any([
        AbortSignal.timeout(PAGE_MS),
        ...(init?.signal ? [init.signal] : []),
      ]),
    });
  const tavily = new Tavily(key, timed);
  return {
    extract: (urls) => tavily.extract(urls),
    search: (query, { domains, maxResults }) =>
      tavily.search(query, { includeDomains: domains, maxResults }),
  };
}

/**
 * `work`, or `fallback` once a page read's time is up. The reader aborts its own requests at
 * PAGE_MS; this is the backstop for one that doesn't.
 */
export function bounded<T>(work: Promise<T>, fallback: T, ms = PAGE_MS + 500): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

const NAME_STOP = new Set(["the", "and", "for", "with", "of", "in", "on", "to", "set", "pack"]);

/** The words of an item's name a page about it would show: "Amber Glow pillar" → amber, glow… */
export function nameWords(name: string): string[] {
  const words = name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !NAME_STOP.has(w));
  return [...new Set(words)];
}

/** A page's path, decoded, for matching words in it ("/products/amber-glow-pillar"). */
function pathOf(url: string): string {
  try {
    const path = new URL(url).pathname;
    try {
      return decodeURIComponent(path);
    } catch {
      return path;
    }
  } catch {
    return "";
  }
}

/**
 * The hit most about this item: its name's words in the title or the page's path count double.
 * A hit that shows fewer than half of the words is about something else, and null means none fits.
 */
export function bestHit(hits: SearchHit[], name: string): SearchHit | null {
  const words = nameWords(name);
  if (words.length === 0) return null;
  let best: { hit: SearchHit; score: number } | null = null;
  for (const hit of hits) {
    const head = `${hit.title} ${pathOf(hit.url)}`.toLowerCase();
    const body = hit.content.toLowerCase();
    const shown = words.filter((w) => head.includes(w) || body.includes(w)).length;
    if (shown < Math.ceil(words.length / 2)) continue;
    const score = words.reduce(
      (sum, w) => sum + (head.includes(w) ? 2 : body.includes(w) ? 1 : 0),
      0,
    );
    if (!best || score > best.score) best = { hit, score };
  }
  return best?.hit ?? null;
}

export interface ListingRead {
  /** The item's page on the shop's site, or null when none was found. */
  page: { url: string; content: string } | null;
  /** False when the site couldn't be searched at all (an error or no answer in time). */
  reached: boolean;
}

/**
 * An item's own page on the shop's site: Tavily searches only that site for the item's name, and
 * the best hit is read in full. If the full read fails, the search's own text from the page stands
 * in for it.
 */
export async function findListing(web: WebReader, site: Site, name: string): Promise<ListingRead> {
  const hits = await bounded(
    web.search(name, { domains: [site.domain], maxResults: 5 }).catch((error) => {
      console.error("[analysis] site search failed", site.domain, error);
      return null;
    }),
    null,
  );
  if (hits === null) return { page: null, reached: false };
  const best = bestHit(
    hits.filter((h) => onSite(h.url, site)),
    name,
  );
  if (!best) return { page: null, reached: true };
  const pages = await bounded(
    web.extract([best.url]).catch((error) => {
      console.error("[analysis] couldn't read", best.url, error);
      return [];
    }),
    [],
  );
  const content = pages.find((p) => p.content.trim())?.content ?? best.content;
  return { page: content.trim() ? { url: best.url, content } : null, reached: true };
}
