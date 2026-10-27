/** Dates, times and small dollar amounts, the way the app shows them. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Times show in the shop's own time zone (Wick & Ember is in Portland), the same one the agent
 * writes in, so an order's day never differs between the timeline and a draft.
 */
export const SHOP_TIME_ZONE = "America/Los_Angeles";

const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: SHOP_TIME_ZONE,
});
const shortDateYear = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: SHOP_TIME_ZONE,
});
const time = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: SHOP_TIME_ZONE,
});
const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: SHOP_TIME_ZONE });

/** "Oct 25", or "Oct 25, 2025" outside this year. */
export function formatDate(iso: string, now: number): string {
  const date = new Date(iso);
  return date.getFullYear() === new Date(now).getFullYear()
    ? shortDate.format(date)
    : shortDateYear.format(date);
}

/** "Oct 25, 3:40 PM". */
export function formatDateTime(iso: string, now: number): string {
  return `${formatDate(iso, now)}, ${time.format(new Date(iso))}`;
}

export function formatTime(iso: string): string {
  return time.format(new Date(iso));
}

/** "Just now", "12 min ago", "3 hours ago", "Yesterday", "4 days ago", then the date. */
export function timeAgo(iso: string, now: number): string {
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
  return formatDate(iso, now);
}

/** "Today", "Yesterday", "Mon", or a date: for grouping a timeline. */
export function dayLabel(iso: string, now: number): string {
  const date = new Date(iso);
  const today = new Date(now);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(date)) / DAY);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return weekday.format(date);
  return formatDate(iso, now);
}

/** A model call's cost in dollars: "$0.0042", "$0.021", "$1.20". */
export function formatCost(dollars: number | null | undefined): string {
  if (dollars === null || dollars === undefined) return "Price unknown";
  if (dollars === 0) return "$0";
  if (dollars < 0.001) return "<$0.001";
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  if (dollars < 1) return `$${dollars.toFixed(3)}`;
  return `$${dollars.toFixed(2)}`;
}

/** "1.2k" tokens. */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
}

/** "0.7%". */
export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** "2.4 s" or "640 ms". */
export function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}
