import "server-only";

/**
 * Dates as the agent writes them, on the shop's own calendar: every day and time is in the shop's
 * time zone (`shop.timeZone`), so a parcel delivered late in the evening in Sydney is written on
 * Sydney's day. Also moving dates for a replay: a sample shop's dates are relative to the moment it
 * was seeded, so a run recorded in one sample shop is replayed into another by shifting every
 * timestamp and every written date ("Oct 23", "October 23rd, 2026") by the same amount.
 */

const DAY = 24 * 60 * 60 * 1000;

interface ZoneFormats {
  day: Intl.DateTimeFormat;
  shortDay: Intl.DateTimeFormat;
  time: Intl.DateTimeFormat;
  parts: Intl.DateTimeFormat;
}

/** Formatters by time zone, made once each. */
const zones = new Map<string, ZoneFormats>();

function makeFormats(timeZone: string): ZoneFormats {
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone, ...options });
  return {
    day: format({ month: "short", day: "numeric", year: "numeric" }),
    shortDay: format({ month: "short", day: "numeric" }),
    time: format({ hour: "numeric", minute: "2-digit" }),
    parts: format({ year: "numeric", month: "numeric", day: "numeric" }),
  };
}

/**
 * A zone's formatters. Profiles only hold zones the runtime knows; one it doesn't (an old record)
 * reads as UTC rather than failing the analysis.
 */
function formatsFor(timeZone: string): ZoneFormats {
  let found = zones.get(timeZone);
  if (!found) {
    try {
      found = makeFormats(timeZone);
    } catch {
      found = makeFormats("UTC");
    }
    zones.set(timeZone, found);
  }
  return found;
}

/** "Oct 23, 2026", on the shop's calendar. */
export function formatDay(iso: string | Date, timeZone: string): string {
  return formatsFor(timeZone).day.format(new Date(iso));
}

/** "Oct 23", on the shop's calendar. */
export function formatShortDay(iso: string | Date, timeZone: string): string {
  return formatsFor(timeZone).shortDay.format(new Date(iso));
}

/** "Oct 23, 2026 at 3:02 PM", the shop's local time. Newer ICU puts a narrow space before PM. */
export function formatDayTime(iso: string | Date, timeZone: string): string {
  const date = new Date(iso);
  const { day, time } = formatsFor(timeZone);
  return `${day.format(date)} at ${time.format(date).replace(/\s/g, " ")}`;
}

interface Ymd {
  y: number;
  m: number;
  d: number;
}

/** The shop's calendar day for an instant. */
export function shopDay(iso: string | Date, timeZone: string): Ymd {
  const parts = formatsFor(timeZone).parts.formatToParts(new Date(iso));
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

/** Moves days from one sample shop's calendar to another's. */
export interface DayShift {
  /** Whole days to add when a date isn't one of the known ones. */
  days: number;
  /** Known days, old to new, from instants recorded in both shops. */
  known: Map<string, Ymd>;
  /** Around when the recording was made, to place a date written without a year. */
  anchor: Ymd;
}

/**
 * A shift of `ms` milliseconds on the calendar of `timeZone`, the zone the dates were written in.
 * `pairs` are the same moments in both shops (when the case opened, each tracking scan…), so
 * their days map exactly even when the seed rounds its times.
 */
export function dayShift(
  ms: number,
  anchorIso: string,
  pairs: [string, string][],
  timeZone: string,
): DayShift {
  const known = new Map<string, Ymd>();
  for (const [from, to] of pairs) {
    if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) continue;
    known.set(key(shopDay(from, timeZone)), shopDay(to, timeZone));
  }
  return { days: Math.round(ms / DAY), known, anchor: shopDay(anchorIso, timeZone) };
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
