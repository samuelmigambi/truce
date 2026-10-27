import "server-only";

import type { Workspace } from "@/lib/domain";

/**
 * The limits that keep Token Factory credits safe through judging: live runs per workspace per
 * day, and a global daily spend cap. The counters live in the store (see @/server/limits); this
 * module only decides, so it's testable with a fake.
 */
export interface Budget {
  /** True when this call is within the limit; the call counts toward it. */
  rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
  addSpend(dollars: number): Promise<unknown>;
  /** Dollars spent on models today, across every workspace. */
  spendToday(): Promise<number>;
}

export type Activity = "analyze" | "chat" | "sweep";

/** Per workspace per day. The live workspace gets more, for recording the demo. */
export const DAILY_LIMITS: Record<Activity, number> = { analyze: 20, chat: 60, sweep: 12 };
const LIVE_WORKSPACE_FACTOR = 5;
const DAY_SECONDS = 24 * 60 * 60;

/** TRUCE_DAILY_SPEND_CAP in dollars; $5 unless set. */
export function dailySpendCap(env: Record<string, string | undefined> = process.env): number {
  const cap = Number(env.TRUCE_DAILY_SPEND_CAP);
  return Number.isFinite(cap) && cap > 0 ? cap : 5;
}

export type Gate = { ok: true } | { ok: false; reason: "spend" | "rate"; message: string };

const SPEND: Record<Activity, string> = {
  analyze:
    "Truce has used today's model budget for the demo, so live analysis is paused until tomorrow. Recorded runs still play back.",
  chat: "Truce has used today's model budget for the demo, so Ask Truce is paused until tomorrow.",
  sweep: "Truce has used today's model budget for the demo, so this check ran the rules only.",
};

const RATE: Record<Activity, (limit: number) => string> = {
  analyze: (n) =>
    `This demo copy has run ${n} live analyses today, the daily limit. Recorded runs still play back, and live runs open again tomorrow.`,
  chat: (n) =>
    `You've asked ${n} questions in this demo copy today, the daily limit. Ask Truce opens again tomorrow.`,
  sweep: (n) =>
    `This demo copy has run the overnight check ${n} times today. It opens again tomorrow.`,
};

/** May this workspace start a live run now? Counts the run when it may. */
export async function gate(
  budget: Budget,
  activity: Activity,
  workspace: Pick<Workspace, "id" | "kind">,
  cap: number = dailySpendCap(),
): Promise<Gate> {
  try {
    if ((await budget.spendToday()) >= cap)
      return { ok: false, reason: "spend", message: SPEND[activity] };
    const limit = DAILY_LIMITS[activity] * (workspace.kind === "live" ? LIVE_WORKSPACE_FACTOR : 1);
    if (!(await budget.rateLimit(`${activity}:${workspace.id}`, limit, DAY_SECONDS))) {
      return { ok: false, reason: "rate", message: RATE[activity](limit) };
    }
  } catch (error) {
    // A counter that can't be read shouldn't take the demo down; the next call checks again.
    console.error("[budget] limits unavailable", error);
  }
  return { ok: true };
}

/** Records spend without ever failing the step that spent it. */
export function spend(budget: Budget, dollars: number | null): Promise<void> {
  if (!dollars || dollars <= 0) return Promise.resolve();
  return budget.addSpend(dollars).then(
    () => undefined,
    (error) => console.error("[budget] couldn't record spend", error),
  );
}
