import "server-only";

import { createHash } from "node:crypto";
import type { AnalysisEvent } from "@/lib/api-types";
import type { Analysis, Case, Order, Shop } from "@/lib/domain";
import { dayShift, KEEP_FIELDS, shiftDates, shiftText, type DayShift } from "../dates";
import { PROMPT_VERSION } from "../prompts";
import { caseUrgency } from "./triage";

/**
 * Recorded sample-shop runs. Every sample shop starts with the same five cases, so the first live
 * run of each is recorded, event by event, and later visitors watch it again at a natural pace
 * instead of paying for it twice. A sample shop's dates are relative to the moment it was seeded,
 * so the recording is moved to the visitor's calendar first. Real shops never replay: their cases
 * are their own.
 */

const DAY = 24 * 60 * 60 * 1000;
/** Replays take ten seconds, however long the live run took. */
export const REPLAY_MS = 10_000;
export const RECORDING_SECONDS = 120 * 24 * 60 * 60;

/**
 * What a run's words depend on besides the case: the shop's name (the sign-off), its currency
 * (every amount) and its time zone (every date and time). A recording only plays in a shop that
 * matches.
 */
export type Voice = Pick<Shop, "name" | "currency" | "timeZone">;

export interface Recording {
  version: 2;
  promptVersion: string;
  /** The moment the recording's shop was seeded; the seed's dates are relative to it. */
  anchor: string;
  recordedAt: string;
  /** How many days after its shop was seeded the run happened. */
  age: number;
  fingerprint: string;
  shop: Voice;
  /** The case's moments (opened, scans, messages…) in the recording's calendar, in a fixed order. */
  instants: string[];
  /** Every event but the result, with its time from the start of the run. */
  timeline: { at: number; event: AnalysisEvent }[];
  analysis: Analysis;
}

const voiceOf = (shop: Voice): Voice => ({
  name: shop.name,
  currency: shop.currency,
  timeZone: shop.timeZone,
});

function sameVoice(a: Voice | undefined, b: Voice): boolean {
  return !!a && a.name === b.name && a.currency === b.currency && a.timeZone === b.timeZone;
}

/**
 * `analysis:<seed version>:<seed case>:<prompt version>:<voice>`. A sample shop's seed version
 * carries the day its dates hang from ("wick-ember-1@2026-10-27"); the day is left out, because a
 * replay is moved to the visitor's calendar, so one recording serves every day. The voice is a
 * short hash of the shop's name, currency and time zone, so shops that write differently keep
 * their own recordings.
 */
export function replayKey(seedVersion: string, seedCaseId: string, shop: Voice): string {
  const voice = createHash("sha256")
    .update(`${shop.name}\n${shop.currency}\n${shop.timeZone}`)
    .digest("hex")
    .slice(0, 12);
  return `analysis:${seedVersion.split("@")[0]}:${seedCaseId}:${PROMPT_VERSION}:${voice}`;
}

/** The facts an analysis depends on, without the dates and IDs that differ between sample shops. */
export function fingerprint(kase: Case, order: Order | null, closed: Case[]): string {
  const facts = {
    kase: {
      reason: kase.reason,
      stage: kase.stage,
      status: kase.status,
      amount: kase.amount,
      buyer: kase.buyer.name,
      item: kase.itemSummary,
      claim: kase.buyerClaim,
      messages: kase.messages.map((m) => [m.from, m.text]),
      photos: kase.photos.map((p) => [p.url, p.caption]),
    },
    order: order && {
      id: order.id,
      amount: order.amount,
      items: order.items,
      protection: order.protection,
      paypalAddress: order.paypalAddress,
      shipTo: order.shipTo,
      note: order.note ?? null,
      tracking: order.tracking && {
        carrier: order.tracking.carrier,
        number: order.tracking.number,
        uploaded: order.tracking.uploaded,
        signedFor: order.tracking.signedFor,
        delivered: order.tracking.deliveredAt !== null,
        events: (order.tracking.events ?? []).map((e) => [e.status, e.location, e.detail]),
      },
    },
    closed: closed
      .map((c) => [
        c.id,
        c.reason,
        c.outcome,
        c.itemSummary,
        c.amount,
        c.moneyKept,
        c.feeCharged,
        c.feeAvoided,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  };
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex").slice(0, 32);
}

/** The case's moments in a fixed order, so two shops' lists line up one to one. */
export function instantsOf(kase: Case, order: Order | null, closed: Case[]): string[] {
  const list: (string | null | undefined)[] = [
    kase.openedAt,
    kase.dueAt,
    ...kase.messages.map((m) => m.at),
  ];
  if (order) {
    list.push(
      order.placedAt,
      order.tracking?.deliveredAt,
      ...(order.tracking?.events ?? []).map((e) => e.at),
    );
  }
  for (const c of [...closed].sort((a, b) => a.id.localeCompare(b.id)))
    list.push(c.openedAt, c.closedAt);
  return list.map((v) => v ?? "");
}

/** The moment a sample shop's dates hang from: when it was seeded, or else when it was made. */
export function anchorOf(shop: Pick<Shop, "seededAt" | "createdAt">): string {
  return shop.seededAt ?? shop.createdAt;
}

export function ageInDays(shop: Pick<Shop, "seededAt" | "createdAt">, now: Date): number {
  return (now.getTime() - Date.parse(anchorOf(shop))) / DAY;
}

export function makeRecording(opts: {
  shop: Shop;
  kase: Case;
  order: Order | null;
  closed: Case[];
  now: Date;
  timeline: { at: number; event: AnalysisEvent }[];
  analysis: Analysis;
}): Recording {
  return {
    version: 2,
    promptVersion: PROMPT_VERSION,
    anchor: anchorOf(opts.shop),
    recordedAt: opts.now.toISOString(),
    age: ageInDays(opts.shop, opts.now),
    fingerprint: fingerprint(opts.kase, opts.order, opts.closed),
    shop: voiceOf(opts.shop),
    instants: instantsOf(opts.kase, opts.order, opts.closed),
    timeline: opts.timeline.filter((t) => t.event.type !== "result"),
    analysis: opts.analysis,
  };
}

/**
 * Whether a recording was made from the same facts as this case, with today's prompts, in a shop
 * that writes the same way.
 */
export function sameFacts(
  rec: Recording,
  kase: Case,
  order: Order | null,
  closed: Case[],
  shop: Voice,
): boolean {
  return (
    rec.version === 2 &&
    rec.promptVersion === PROMPT_VERSION &&
    sameVoice(rec.shop, shop) &&
    rec.fingerprint === fingerprint(kase, order, closed)
  );
}

/**
 * Whether a recording fits this visitor's case: the same facts, and about as old relative to its
 * shop's seeding, so "due tomorrow" still means tomorrow.
 */
export function recordingFits(
  rec: Recording,
  shop: Shop,
  kase: Case,
  order: Order | null,
  closed: Case[],
  now: Date,
): boolean {
  return sameFacts(rec, kase, order, closed, shop) && Math.abs(ageInDays(shop, now) - rec.age) < 1;
}

/** The draft streams over 1.2–2.5 s of a replay, about 15 ms a piece, so it still reads as written. */
const TEXT_MS = { each: 15, min: 1_200, max: 2_500 };

/**
 * When each recorded event plays, in milliseconds from the start: REPLAY_MS in all, however long
 * the live run took. The draft's text gets its own share so it streams naturally; every other
 * gap is scaled to fill the rest, in proportion, so the order and rhythm stay the same.
 */
export function paceTimeline(
  items: { at: number; event: AnalysisEvent }[],
  target = REPLAY_MS,
): number[] {
  const gaps = items.map((t, i) => Math.max(0, t.at - (i > 0 ? items[i - 1]!.at : 0)));
  const text = items.map((t) => t.event.type === "text");
  const pieces = text.filter(Boolean).length;
  const textBudget = pieces
    ? Math.min(TEXT_MS.max, Math.max(TEXT_MS.min, pieces * TEXT_MS.each))
    : 0;
  const sum = (inText: boolean) =>
    gaps.reduce((total, g, i) => total + (text[i] === inText ? g : 0), 0);
  const textGaps = sum(true);
  const otherGaps = sum(false);
  const otherBudget = target - textBudget;
  let clock = 0;
  return gaps.map((gap, i) => {
    if (text[i]) clock += textGaps > 0 ? (gap * textBudget) / textGaps : textBudget / pieces;
    else clock += otherGaps > 0 ? (gap * otherBudget) / otherGaps : 0;
    return Math.round(clock);
  });
}

/** Streamed text is moved as a whole (a date can be split across pieces), then cut back into pieces. */
function shiftStreams(events: AnalysisEvent[], shift: DayShift): AnalysisEvent[] {
  const out = [...events];
  const byStep = new Map<string, number[]>();
  out.forEach((e, i) => {
    if (e.type === "text") byStep.set(e.step, [...(byStep.get(e.step) ?? []), i]);
  });
  for (const indices of byStep.values()) {
    const pieces = indices.map((i) => (out[i] as { delta: string }).delta);
    const joined = pieces.join("");
    const moved = shiftText(joined, shift);
    if (moved === joined) continue;
    let pos = 0;
    indices.forEach((index, n) => {
      const length = n === indices.length - 1 ? moved.length - pos : pieces[n]!.length;
      out[index] = {
        ...(out[index] as Extract<AnalysisEvent, { type: "text" }>),
        delta: moved.slice(pos, pos + length),
      };
      pos += length;
    });
  }
  return out;
}

export interface ReplayTarget {
  shop: Shop;
  kase: Case;
  order: Order | null;
  closed: Case[];
  now: Date;
  sleep: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

/** The recording moved to the visitor's calendar: the analysis, and the events to play. */
export function moveRecording(
  rec: Recording,
  target: ReplayTarget,
): { events: { at: number; event: AnalysisEvent }[]; analysis: Analysis } {
  const now = target.now;
  const theirs = instantsOf(target.kase, target.order, target.closed);
  const pairs: [string, string][] = rec.instants.flatMap((from, i) =>
    from && theirs[i] ? [[from, theirs[i]!] as [string, string]] : [],
  );
  // The seed hangs every date from one moment, so any pair gives the offset; the shops' seeding
  // times are the fallback.
  const first = pairs[0];
  const ms = first
    ? Date.parse(first[1]) - Date.parse(first[0])
    : Date.parse(anchorOf(target.shop)) - Date.parse(rec.anchor);
  const exact = new Map(
    pairs.map(([from, to]) => [new Date(from).toISOString(), new Date(to).toISOString()]),
  );
  const moveInstant = (iso: string) => {
    const known = exact.get(new Date(iso).toISOString());
    return known ?? new Date(Date.parse(iso) + ms).toISOString();
  };
  // A recording only plays in a shop with its time zone (see sameFacts), so the written dates
  // move on that one calendar.
  const shift = dayShift(ms, rec.recordedAt, pairs, rec.shop.timeZone);

  // Streamed pieces are moved together below, not one by one.
  const moved = shiftDates(rec.timeline, moveInstant, shift, new Set([...KEEP_FIELDS, "delta"]));
  const streams = shiftStreams(
    moved.map((t) => t.event),
    shift,
  );
  const events = moved.map((t, i) => ({ at: t.at, event: streams[i]! }));

  const analysis = shiftDates(rec.analysis, moveInstant, shift);
  analysis.caseId = target.kase.id;
  analysis.createdAt = now.toISOString();
  analysis.triage = { ...analysis.triage, urgency: caseUrgency(target.kase, now) };
  return { events, analysis };
}

/**
 * Plays a recording back at a natural pace and returns the moved analysis; the caller saves it
 * and sends the result, so a visitor who refetches straight away finds it.
 */
export async function* replay(
  rec: Recording,
  target: ReplayTarget,
): AsyncGenerator<AnalysisEvent, Analysis | null> {
  const { events, analysis } = moveRecording(rec, target);
  const times = paceTimeline(events);
  let clock = 0;
  for (let i = 0; i < events.length; i++) {
    if (target.signal?.aborted) return null;
    const wait = times[i]! - clock;
    if (wait > 0) await target.sleep(wait);
    clock = times[i]!;
    const event = events[i]!.event;
    if (event.type === "text" && !event.delta) continue;
    yield event;
  }
  return analysis;
}
