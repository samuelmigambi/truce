import "server-only";

import type { Shop, ShopKind } from "@/lib/domain";

/**
 * The limits that keep Token Factory credits safe: live runs per shop per day, and a global daily
 * spend cap. The counters live in the store (see @/server/limits); this module only decides, so
 * it's testable with a fake.
 */
export interface Budget {
  /** True when this call is within the limit; the call counts toward it. */
  rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
  addSpend(dollars: number): Promise<unknown>;
  /** Dollars spent on models today, across every shop. */
  spendToday(): Promise<number>;
}

export type Activity = "analyze" | "chat" | "sweep";

/**
 * Per shop per day. A sample shop is for trying Truce out, and its seeded cases replay; a real
 * shop's every case runs live, and its overnight check runs on a schedule too.
 */
export const DAILY_LIMITS: Record<ShopKind, Record<Activity, number>> = {
  sample: { analyze: 20, chat: 60, sweep: 12 },
  real: { analyze: 100, chat: 200, sweep: 48 },
};
const DAY_SECONDS = 24 * 60 * 60;

/** TRUCE_DAILY_SPEND_CAP in dollars; $5 unless set. */
export function dailySpendCap(env: Record<string, string | undefined> = process.env): number {
  const cap = Number(env.TRUCE_DAILY_SPEND_CAP);
  return Number.isFinite(cap) && cap > 0 ? cap : 5;
}

export type Gate = { ok: true } | { ok: false; reason: "spend" | "rate"; message: string };

const SPEND: Record<Activity, (kind: ShopKind) => string> = {
  analyze: (kind) =>
    `Truce has reached today's limit for new analyses. It's back tomorrow.${kind === "sample" ? " Earlier analyses still play back." : ""}`,
  chat: () => "Ask Truce has reached today's limit for this shop. It's back tomorrow.",
  sweep: () =>
    "Truce has reached today's limit, so this check covered tracking and deadlines only.",
};

const RATE: Record<Activity, (limit: number, kind: ShopKind) => string> = {
  analyze: (n, kind) =>
    `This shop has run ${n} analyses today, the daily limit. ${kind === "sample" ? "Earlier analyses still play back, and new ones open again tomorrow." : "New ones open again tomorrow."}`,
  chat: (n) =>
    `This shop has asked Truce ${n} questions today, the daily limit. Ask Truce opens again tomorrow.`,
  sweep: (n) => `This shop has run the overnight check ${n} times today. It opens again tomorrow.`,
};

/** May this shop start a live run now? Counts the run when it may. */
export async function gate(
  budget: Budget,
  activity: Activity,
  shop: Pick<Shop, "id" | "kind">,
  cap: number = dailySpendCap(),
): Promise<Gate> {
  try {
    if ((await budget.spendToday()) >= cap)
      return { ok: false, reason: "spend", message: SPEND[activity](shop.kind) };
    const limit = DAILY_LIMITS[shop.kind][activity];
    if (!(await budget.rateLimit(`${activity}:${shop.id}`, limit, DAY_SECONDS))) {
      return { ok: false, reason: "rate", message: RATE[activity](limit, shop.kind) };
    }
  } catch (error) {
    // A counter that can't be read shouldn't take the app down; the next call checks again.
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
