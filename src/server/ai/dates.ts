import "server-only";

/**
 * Dates as the agent writes them, and moving them for a replay. A demo copy's dates are relative
 * to the day it was made, so a run recorded in one copy is replayed into another by shifting every
 * timestamp and every written date ("Oct 23", "October 23rd, 2026") by the same amount.
 */

/** The shop is in Portland, so days are Pacific days. */
export const SHOP_TIME_ZONE = "America/Los_Angeles";

const DAY = 24 * 60 * 60 * 1000;

const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOP_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});
const shortDayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOP_TIME_ZONE,
  month: "short",
  day: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOP_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});
const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOP_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/** "Oct 23, 2026". */
export function formatDay(iso: string | Date): string {
  return dayFormat.format(new Date(iso));
}

/** "Oct 23". */
export function formatShortDay(iso: string | Date): string {
  return shortDayFormat.format(new Date(iso));
}

/** "Oct 23, 2026 at 3:02 PM". */
export function formatDayTime(iso: string | Date): string {
  const date = new Date(iso);
  return `${dayFormat.format(date)} at ${timeFormat.format(date)}`;
}

interface Ymd {
  y: number;
  m: number;
  d: number;
}

/** The shop's calendar day for an instant. */
export function shopDay(iso: string | Date): Ymd {
  const parts = partsFormat.formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

const key = (v: Ymd) => `${v.y}-${v.m}-${v.d}`;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const MONTH =
  "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const WEEKDAY =
  "(Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:r(?:s(?:day)?)?)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)";
const MONTH_FIRST = new RegExp(
  `\\b(?:${WEEKDAY},?\\s+)?${MONTH}(\\.?)\\s+(\\d{1,2})(st|nd|rd|th)?\\b(?:(,?\\s+)(20\\d{2})\\b)?`,
  "g",
);
const DAY_FIRST = new RegExp(
  `\\b(\\d{1,2})(st|nd|rd|th)?\\s+${MONTH}\\b(\\.?)(?:(,?\\s+)(20\\d{2})\\b)?`,
  "g",
);
const ISO_DAY = /\b(\d{4})-(\d{2})-(\d{2})\b(?!T)/g;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function monthIndex(token: string): number {
  return MONTHS.findIndex((m) => m.toLowerCase().startsWith(token.slice(0, 3).toLowerCase()));
}

function ordinal(d: number): string {
  if (d % 100 >= 11 && d % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][d % 10] ?? "th";
}

/** Moves days from one demo copy's calendar to another's. */
export interface DayShift {
  /** Whole days to add when a date isn't one of the known ones. */
  days: number;
  /** Known days, old to new, from instants recorded in both copies. */
  known: Map<string, Ymd>;
  /** Around when the recording was made, to place a date written without a year. */
  anchor: Ymd;
}

/**
 * A shift of `ms` milliseconds. `pairs` are the same moments in both copies (when the case opened,
 * each tracking scan…), so their days map exactly even when the seed rounds its times.
 */
export function dayShift(ms: number, anchorIso: string, pairs: [string, string][] = []): DayShift {
  const known = new Map<string, Ymd>();
  for (const [from, to] of pairs) {
    if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) continue;
    known.set(key(shopDay(from)), shopDay(to));
  }
  return { days: Math.round(ms / DAY), known, anchor: shopDay(anchorIso) };
}

function moveDay(day: Ymd, shift: DayShift): Ymd {
  const mapped = shift.known.get(key(day));
  if (mapped) return mapped;
  const t = new Date(Date.UTC(day.y, day.m - 1, day.d) + shift.days * DAY);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** The year that puts a month and day closest to the anchor, for dates written without one. */
function guessYear(m: number, d: number, anchor: Ymd): number {
  const target = Date.UTC(anchor.y, anchor.m - 1, anchor.d);
  let best = anchor.y;
  for (const y of [anchor.y - 1, anchor.y, anchor.y + 1]) {
    if (Math.abs(Date.UTC(y, m - 1, d) - target) < Math.abs(Date.UTC(best, m - 1, d) - target))
      best = y;
  }
  return best;
}

function weekdayName(day: Ymd, short: boolean): string {
  const name = WEEKDAYS[new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay()]!;
  return short ? name.slice(0, 3) : name;
}

/** The month in the style of `like`: "October" stays a full name, "Oct" (or "Sept", or "May") short. */
function monthName(m: number, like: string): string {
  const name = MONTHS[m - 1]!;
  const full = like.length > 3 && like.toLowerCase() !== "sept";
  return full ? name : name.slice(0, 3);
}

/** Written dates in `text`, moved by `shift`, each kept in the style it was written in. */
export function shiftText(text: string, shift: DayShift): string {
  if (shift.days === 0 && [...shift.known].every(([k, v]) => k === key(v))) return text;
  return text
    .replace(
      MONTH_FIRST,
      (
        match,
        weekday: string | undefined,
        month: string,
        dot: string,
        day: string,
        suffix: string | undefined,
        sep: string | undefined,
        year: string | undefined,
      ) => {
        const m = monthIndex(month) + 1;
        const d = Number(day);
        if (m < 1 || d < 1 || d > 31) return match;
        const moved = moveDay(
          { y: year ? Number(year) : guessYear(m, d, shift.anchor), m, d },
          shift,
        );
        const head = weekday ? `${weekdayName(moved, weekday.length <= 4)}, ` : "";
        const tail = year ? `${sep ?? ", "}${moved.y}` : "";
        return `${head}${monthName(moved.m, month)}${dot} ${moved.d}${suffix ? ordinal(moved.d) : ""}${tail}`;
      },
    )
    .replace(
      DAY_FIRST,
      (
        match,
        day: string,
        suffix: string | undefined,
        month: string,
        dot: string,
        sep: string | undefined,
        year: string | undefined,
      ) => {
        const m = monthIndex(month) + 1;
        const d = Number(day);
        if (m < 1 || d < 1 || d > 31) return match;
        const moved = moveDay(
          { y: year ? Number(year) : guessYear(m, d, shift.anchor), m, d },
          shift,
        );
        const tail = year ? `${sep ?? " "}${moved.y}` : "";
        return `${moved.d}${suffix ? ordinal(moved.d) : ""} ${monthName(moved.m, month)}${dot}${tail}`;
      },
    )
    .replace(ISO_DAY, (_match, y: string, m: string, d: string) => {
      const moved = moveDay({ y: Number(y), m: Number(m), d: Number(d) }, shift);
      return `${moved.y}-${String(moved.m).padStart(2, "0")}-${String(moved.d).padStart(2, "0")}`;
    });
}

/**
 * A copy of `value` with every ISO timestamp moved by `moveInstant` and every written date in its
 * strings moved by `shift`. Keys named in `keep` are left alone (IDs, URLs).
 */
export function shiftDates<T>(
  value: T,
  moveInstant: (iso: string) => string,
  shift: DayShift,
  keep: ReadonlySet<string> = KEEP_FIELDS,
): T {
  const walk = (v: unknown, field?: string): unknown => {
    if (typeof v === "string") {
      if (field && keep.has(field)) return v;
      if (ISO_INSTANT.test(v)) return moveInstant(v);
      return shiftText(v, shift);
    }
    if (Array.isArray(v)) return v.map((item) => walk(item, field));
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, item]) => [k, walk(item, k)]));
    }
    return v;
  };
  return walk(value) as T;
}

/** Fields that hold IDs, URLs or model names, never dates. */
export const KEEP_FIELDS: ReadonlySet<string> = new Set([
  "id",
  "caseId",
  "orderId",
  "url",
  "source",
  "model",
  "promptVersion",
  "evidence",
  "evidenceIds",
]);
