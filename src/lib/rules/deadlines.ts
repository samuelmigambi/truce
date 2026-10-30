const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export type Urgency = "overdue" | "today" | "soon" | "later";

/** Whole days until PayPal's response deadline; negative once it has passed. */
export function daysLeft(due: Date, now: Date): number {
  return Math.ceil((due.getTime() - now.getTime()) / DAY);
}

export function urgency(due: Date, now: Date): Urgency {
  if (due.getTime() <= now.getTime()) return "overdue";
  const days = daysLeft(due, now);
  if (days <= 1) return "today";
  if (days <= 3) return "soon";
  return "later";
}

/**
 * "Due in 3 days", "Overdue by 2 days". Within a day it counts hours, since "today" would be
 * wrong for a deadline early tomorrow.
 */
export function dueLabel(due: Date, now: Date): string {
  const left = due.getTime() - now.getTime();
  if (left <= 0) {
    const late = Math.max(1, -daysLeft(due, now));
    return `Overdue by ${late} ${late === 1 ? "day" : "days"}`;
  }
  if (left <= DAY) {
    const hours = Math.ceil(left / HOUR);
    return hours <= 1 ? "Due within the hour" : `Due in ${hours} hours`;
  }
  return `Due in ${daysLeft(due, now)} days`;
}
