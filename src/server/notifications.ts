import "server-only";

import type { NotificationsResponse } from "@/lib/api-types";
import type {
  AppNotification,
  Case,
  NotificationKind,
  NotificationPrefs,
  Shop,
} from "@/lib/domain";
import { DEFAULT_NOTIFICATIONS } from "@/lib/shop-options";
import { log } from "@/server/log";
import type { Store } from "@/server/store";

/**
 * In-app notifications, which are real today (email delivery is coming, and the app says so).
 * They belong to the shop, so every member sees the same list, and each member's own choices
 * decide which kinds they're shown. IDs are made from what happened, so the same event never
 * notifies twice, however many syncs see it.
 */

const LIST_LIMIT = 50;
const DAY = 24 * 60 * 60 * 1000;

export interface NewNotification {
  /** A stable ID for the event, such as "opened:PP-D-1". */
  id: string;
  kind: NotificationKind;
  title: string;
  detail?: string;
  caseId?: string;
  at?: string;
}

/** Records a notification, once. Never fails the work that caused it. */
export async function notify(store: Store, shopId: string, input: NewNotification): Promise<void> {
  const notification: AppNotification = {
    id: input.id,
    kind: input.kind,
    at: input.at ?? new Date().toISOString(),
    title: input.title,
    ...(input.detail ? { detail: input.detail } : {}),
    ...(input.caseId ? { caseId: input.caseId } : {}),
    readBy: [],
  };
  try {
    const existing = await store.listNotifications(shopId, LIST_LIMIT);
    if (existing.some((n) => n.id === notification.id)) return;
    await store.saveNotification(shopId, notification);
  } catch (error) {
    log.warn("notifications.save_failed", { shopId, error });
  }
}

/** Which of a member's choices lets each kind through. */
function shown(kind: NotificationKind, prefs: NotificationPrefs): boolean {
  switch (kind) {
    case "dispute_opened":
      return prefs.newDisputes;
    case "buyer_reply":
      return prefs.buyerReplies;
    case "deadline":
      return prefs.deadlines;
    case "decided":
      return prefs.decisions;
    default:
      return true;
  }
}

/** Deadline reminders for open cases due within the member's chosen number of days. */
async function remindDeadlines(
  store: Store,
  shop: Shop,
  cases: Case[],
  existing: AppNotification[],
  now: number,
): Promise<AppNotification[]> {
  const made: AppNotification[] = [];
  const known = new Set(existing.map((n) => n.id));
  for (const kase of cases) {
    if (kase.status === "closed" || kase.status === "waiting_buyer" || !kase.dueAt) continue;
    const left = Date.parse(kase.dueAt) - now;
    if (left < 0 || left > 5 * DAY) continue;
    const id = `deadline:${kase.id}:${kase.dueAt.slice(0, 10)}`;
    if (known.has(id)) continue;
    const days = Math.max(1, Math.ceil(left / DAY));
    const notification: AppNotification = {
      id,
      kind: "deadline",
      at: new Date(now).toISOString(),
      title: `${kase.buyer.name}'s case is due in ${days} ${days === 1 ? "day" : "days"}`,
      detail: kase.itemSummary,
      caseId: kase.id,
      readBy: [],
    };
    await store.saveNotification(shop.id, notification);
    made.push(notification);
  }
  return made;
}

/** The shop's notifications as one member sees them, newest first, with their unread count. */
export async function notificationsFor(
  store: Store,
  shop: Shop,
  uid: string,
  cases: Case[],
  now = Date.now(),
): Promise<NotificationsResponse> {
  const prefs = shop.members[uid]?.notifications ?? DEFAULT_NOTIFICATIONS;
  const stored = await store.listNotifications(shop.id, LIST_LIMIT);
  const reminders = await remindDeadlines(store, shop, cases, stored, now).catch((error) => {
    log.warn("notifications.reminders_failed", { shopId: shop.id, error });
    return [];
  });
  const notifications = [...reminders, ...stored]
    .filter((n) => shown(n.kind, prefs))
    .filter((n) => {
      // A deadline reminder shows only once the case is within the member's own window.
      if (n.kind !== "deadline" || !n.caseId) return true;
      const kase = cases.find((c) => c.id === n.caseId);
      if (!kase?.dueAt || kase.status === "closed") return false;
      return Date.parse(kase.dueAt) - now <= prefs.deadlineDays * DAY;
    })
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  return {
    notifications,
    unread: notifications.filter((n) => !n.readBy.includes(uid)).length,
  };
}

/** Marks these notifications (or all of them) read for one member. */
export async function markRead(
  store: Store,
  shopId: string,
  uid: string,
  ids?: string[],
): Promise<void> {
  const stored = await store.listNotifications(shopId, LIST_LIMIT);
  const wanted = ids ? new Set(ids) : null;
  await Promise.all(
    stored
      .filter((n) => (!wanted || wanted.has(n.id)) && !n.readBy.includes(uid))
      .map((n) => store.saveNotification(shopId, { ...n, readBy: [...n.readBy, uid] })),
  );
}
