const DAY = 24 * 60 * 60 * 1000;

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

/** "Due today", "Due in 3 days", "Overdue by 2 days". */
export function dueLabel(due: Date, now: Date): string {
  const days = daysLeft(due, now);
  if (due.getTime() <= now.getTime()) {
    const late = Math.max(1, -days);
    return `Overdue by ${late} ${late === 1 ? "day" : "days"}`;
  }
  if (days <= 1) return "Due today";
  return `Due in ${days} days`;
}
