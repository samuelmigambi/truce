/** Dates, times and small dollar amounts, the way the app shows them. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Times show in the shop's own time zone, the same one the agent writes in, so an order's day
 * never differs between the timeline and a draft. Each zone's formatters are made once.
 */
interface ZoneFormats {
  date: Intl.DateTimeFormat;
  dateYear: Intl.DateTimeFormat;
  time: Intl.DateTimeFormat;
  weekday: Intl.DateTimeFormat;
  /** Year, month and day as numbers, for comparing calendar days. */
  parts: Intl.DateTimeFormat;
}

const zones = new Map<string, ZoneFormats>();

function make(timeZone: string): ZoneFormats {
  return {
    date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }),
    dateYear: new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone,
    }),
    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }),
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }),
    parts: new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      timeZone,
    }),
  };
}

function formatsFor(timeZone: string): ZoneFormats {
  let found = zones.get(timeZone);
  if (!found) {
    try {
      found = make(timeZone);
    } catch {
      // A zone this browser doesn't know shouldn't break the screen; UTC is at least honest.
      found = make("UTC");
    }
    zones.set(timeZone, found);
  }
  return found;
}

/** The calendar day an instant falls on in the zone: year, and days since 1970. */
function calendarDay(date: Date, timeZone: string): { year: number; index: number } {
  const parts = formatsFor(timeZone).parts.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const year = get("year");
  return { year, index: Math.round(Date.UTC(year, get("month") - 1, get("day")) / DAY) };
}

/** "Oct 25", or "Oct 25, 2025" outside this year. */
export function formatDate(iso: string, now: number, timeZone: string): string {
  const date = new Date(iso);
  const f = formatsFor(timeZone);
  return calendarDay(date, timeZone).year === calendarDay(new Date(now), timeZone).year
    ? f.date.format(date)
    : f.dateYear.format(date);
}

/** "Oct 25, 3:40 PM". */
export function formatDateTime(iso: string, now: number, timeZone: string): string {
  return `${formatDate(iso, now, timeZone)}, ${formatTime(iso, timeZone)}`;
}

export function formatTime(iso: string, timeZone: string): string {
  return formatsFor(timeZone).time.format(new Date(iso));
}

/** "Just now", "12 min ago", "3 hours ago", "Yesterday", "4 days ago", then the date. */
export function timeAgo(iso: string, now: number, timeZone: string): string {
  const diff = now - new Date(iso).getTime();
  if (diff < MINUTE) return "Just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(diff / DAY);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(iso, now, timeZone);
}

/** "Today", "Yesterday", "Mon", or a date, counted in the shop's calendar days. */
export function dayLabel(iso: string, now: number, timeZone: string): string {
  const date = new Date(iso);
  const days = calendarDay(new Date(now), timeZone).index - calendarDay(date, timeZone).index;
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return formatsFor(timeZone).weekday.format(date);
  return formatDate(iso, now, timeZone);
}

/** "0.7%". */
export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** "ABcD12…wXyZ": enough of a long ID to recognise it, without the whole thing. */
export function shortId(id: string, head = 6, tail = 4): string {
  return id.length <= head + tail + 1 ? id : `${id.slice(0, head)}…${id.slice(-tail)}`;
}
