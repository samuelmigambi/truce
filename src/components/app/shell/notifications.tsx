"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Bell,
  BellOff,
  Clock3,
  Flag,
  Gavel,
  MessageSquareText,
  PlugZap,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { mutate } from "swr";
import type { AppNotification, NotificationKind } from "@/lib/domain";
import { markNotificationsRead } from "@/lib/client/actions";
import { errorMessage, shopHref } from "@/lib/client/api";
import { keys, useNotifications } from "@/lib/client/hooks";
import { useMe, useShopDates, useShopId } from "@/lib/client/shop-context";
import { spring } from "../../motion";
import { Button } from "../../ui/button";
import { cn } from "../../ui/cn";
import { Popover, triggerProps, usePopover, type Placement } from "../../ui/popover";
import { Skeleton } from "../../ui/skeleton";
import { useToast } from "../../ui/toast";

const KIND: Record<NotificationKind, { icon: ReactNode; tone: string }> = {
  dispute_opened: { icon: <Flag />, tone: "bg-ink text-lemon" },
  buyer_reply: { icon: <MessageSquareText />, tone: "bg-mist text-moss-deep" },
  dispute_updated: { icon: <RefreshCw />, tone: "bg-ink/[0.06] text-ink-2" },
  decided: { icon: <Gavel />, tone: "bg-lemon text-ink" },
  deadline: { icon: <Clock3 />, tone: "bg-warn-50 text-warn-700" },
  analysis: { icon: <Sparkles />, tone: "bg-mist text-moss-deep" },
  connection: { icon: <PlugZap />, tone: "bg-warn-50 text-warn-700" },
};

/**
 * The bell: what happened in this shop while the seller was away (new disputes, buyer replies,
 * deadlines, PayPal's decisions), newest first. It checks about once a minute, and a new one
 * also refreshes the inbox, so a dispute that arrives by webhook shows up without a reload.
 */
export function Notifications({
  placement = "bottom-start",
  className,
}: {
  placement?: Placement;
  className?: string;
}) {
  const shopId = useShopId();
  const { user } = useMe();
  const { data, error, mutate: reload } = useNotifications();
  const control = usePopover();
  const toast = useToast();
  const unread = data?.unread ?? 0;
  const newest = data?.notifications[0];

  // The first newest one this screen saw; anything newer arrived while it was open.
  const [firstSeen, setFirstSeen] = useState<string | null | undefined>(undefined);
  if (data && firstSeen === undefined) setFirstSeen(newest?.id ?? null);
  const arrived =
    firstSeen !== undefined &&
    newest &&
    newest.id !== firstSeen &&
    !newest.readBy.includes(user.uid)
      ? newest
      : null;

  // Undefined until the first answer; "" once it's known there are none.
  const lastSeen = useRef<string | undefined>(undefined);
  const newestId = data ? (newest?.id ?? "") : undefined;
  useEffect(() => {
    if (newestId === undefined) return;
    const previous = lastSeen.current;
    lastSeen.current = newestId;
    if (previous === undefined || previous === newestId) return;
    void mutate(keys.cases(shopId));
    void mutate(keys.metrics(shopId));
    void mutate(keys.orders(shopId));
  }, [newestId, shopId]);

  async function markAll() {
    try {
      await markNotificationsRead(shopId, user.uid);
    } catch (e) {
      toast({ title: "Couldn't mark them read", description: errorMessage(e), tone: "error" });
    }
  }

  function open(n: AppNotification) {
    control.hide();
    if (!n.readBy.includes(user.uid)) {
      markNotificationsRead(shopId, user.uid, [n.id]).catch(() => undefined);
    }
    if (n.caseId) void mutate(keys.case(shopId, n.caseId));
  }

  return (
    <>
      <button
        {...triggerProps(control, "dialog")}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        title="Notifications"
        className={cn(
          "rounded-btn text-ink-2 hover:bg-wash hover:text-ink relative flex size-9 shrink-0 items-center justify-center transition-colors",
          control.open && "bg-wash text-ink",
          className,
        )}
      >
        <Bell className="size-[18px]" />
        <AnimatePresence initial={false}>
          {unread > 0 && (
            <motion.span
              key={unread}
              aria-hidden
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={spring.pop}
              className="bg-ink text-cream ring-cream absolute top-1 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold tabular-nums ring-2"
            >
              {unread > 9 ? "9+" : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <span className="sr-only" aria-live="polite">
        {arrived ? `New notification: ${arrived.title}` : ""}
      </span>

      <Popover
        control={control}
        kind="dialog"
        label="Notifications"
        placement={placement}
        width={384}
      >
        <div className="border-line-soft flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="text-ink text-[15px] font-semibold">Notifications</h2>
          <Button size="sm" variant="ghost" onClick={markAll} disabled={unread === 0}>
            Mark all as read
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && !data ? (
            <div className="px-6 py-10 text-center">
              <p className="text-ink text-sm font-medium">Couldn&rsquo;t load notifications</p>
              <p className="text-ink-2 mt-1 text-[13px]">{errorMessage(error)}</p>
              <Button size="sm" variant="secondary" className="mt-4" onClick={() => void reload()}>
                Try again
              </Button>
            </div>
          ) : !data ? (
            <ul aria-busy="true" className="divide-line-soft divide-y">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex gap-3 px-4 py-3.5">
                  <Skeleton className="size-8 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </li>
              ))}
            </ul>
          ) : data.notifications.length === 0 ? (
            <div className="flex flex-col items-center px-8 py-12 text-center">
              <span className="bg-mist text-moss-deep flex size-10 items-center justify-center rounded-xl">
                <BellOff className="size-[18px]" />
              </span>
              <p className="text-ink mt-3 text-sm font-medium">Nothing yet</p>
              <p className="text-ink-2 mt-1 max-w-[260px] text-[13px] leading-relaxed">
                Truce tells you here when a buyer opens a dispute or replies, when a deadline gets
                close, and when PayPal decides.
              </p>
            </div>
          ) : (
            <ul className="divide-line-soft divide-y">
              {data.notifications.map((n) => (
                <li key={n.id}>
                  <Item
                    notification={n}
                    unread={!n.readBy.includes(user.uid)}
                    onOpen={() => open(n)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Popover>
    </>
  );
}

function Item({
  notification: n,
  unread,
  onOpen,
}: {
  notification: AppNotification;
  unread: boolean;
  onOpen: () => void;
}) {
  const shopId = useShopId();
  const dates = useShopDates();
  const kind = KIND[n.kind] ?? KIND.dispute_updated;
  const href = n.caseId
    ? shopHref(shopId, `cases/${encodeURIComponent(n.caseId)}`)
    : n.kind === "connection"
      ? shopHref(shopId, "settings#paypal")
      : null;

  const body = (
    <>
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
          kind.tone,
        )}
        aria-hidden
      >
        {kind.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span
            className={cn(
              "text-[13.5px] leading-snug",
              unread ? "text-ink font-medium" : "text-ink-2",
            )}
          >
            {n.title}
          </span>
          {unread && (
            <span className="bg-moss mt-1.5 size-2 shrink-0 rounded-full">
              <span className="sr-only">Unread</span>
            </span>
          )}
        </span>
        {n.detail && (
          <span className="text-ink-2 mt-0.5 line-clamp-2 block text-[13px] leading-relaxed">
            {n.detail}
          </span>
        )}
        <time dateTime={n.at} className="text-ink-3 mt-1 block text-xs">
          {dates.ago(n.at)}
        </time>
      </span>
    </>
  );

  const rowClass = cn(
    "flex gap-3 px-4 py-3.5 text-left transition-colors focus-visible:-outline-offset-2",
    unread && "bg-mist/30",
  );
  return href ? (
    <Link href={href} onClick={onOpen} className={cn(rowClass, "hover:bg-wash")}>
      {body}
    </Link>
  ) : (
    <div className={rowClass}>{body}</div>
  );
}
