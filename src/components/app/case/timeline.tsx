"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  CircleCheck,
  CreditCard,
  Flag,
  Gavel,
  MessageSquareText,
  Package,
  PackageCheck,
  Send,
  Sparkles,
  ThumbsUp,
  Truck,
  TriangleAlert,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Case, CaseEvent, Order } from "@/lib/domain";
import { formatDateTime } from "@/lib/client/format";
import { REASON, STAGE, tidyPlace, TRACKING_STATUS } from "@/lib/client/labels";
import { useNow } from "@/lib/client/now";
import { formatUsd } from "@/lib/money";
import { duration, ease } from "../../motion";
import { Chip } from "../../ui/chip";
import { cn } from "../../ui/cn";

type Tone = "neutral" | "good" | "warn" | "buyer" | "truce" | "seller";

interface Item {
  id: string;
  at: string;
  icon: ReactNode;
  tone: Tone;
  title: string;
  detail?: string;
  quote?: boolean;
  simulated?: boolean;
}

/**
 * The story of the order, from checkout to today: the payment, every carrier scan, the dispute,
 * the messages, and each step taken since.
 */
export function buildTimeline(kase: Case, order: Order | null, events: CaseEvent[]): Item[] {
  const items: Item[] = [];
  if (order) {
    items.push({
      id: "order",
      at: order.placedAt,
      icon: <Package />,
      tone: "neutral",
      title: `Order ${order.id} placed`,
      detail: `${order.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")} · ${formatUsd(order.amount)}`,
    });
    items.push({
      id: "payment",
      at: new Date(new Date(order.placedAt).getTime() + 60_000).toISOString(),
      icon: <CreditCard />,
      tone: order.protection === "ELIGIBLE" ? "good" : "neutral",
      title: "Paid with PayPal",
      detail: [
        order.protection
          ? `Seller Protection: ${order.protection.toLowerCase().replace(/_/g, " ")}`
          : null,
        order.captureId ? `capture ${order.captureId}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
    const scans = order.tracking?.events ?? [];
    if (order.tracking && scans.length === 0) {
      items.push({
        id: "label",
        at: order.placedAt,
        icon: <Truck />,
        tone: "neutral",
        title: `${order.tracking.carrier} label created`,
        detail: order.tracking.number,
      });
    }
    scans.forEach((scan, i) => {
      items.push({
        id: `scan-${i}`,
        at: scan.at,
        icon:
          scan.status === "delivered" ? (
            <PackageCheck />
          ) : scan.status === "exception" ? (
            <TriangleAlert />
          ) : (
            <Truck />
          ),
        tone:
          scan.status === "delivered" ? "good" : scan.status === "exception" ? "warn" : "neutral",
        title: `${TRACKING_STATUS[scan.status]}${scan.location ? ` · ${tidyPlace(scan.location)}` : ""}`,
        detail: scan.detail,
      });
    });
  }

  const hasOpened = events.some((e) => e.kind === "opened");
  const eventMessages = events.some((e) => e.kind === "message" || e.kind === "buyer_reply");
  if (!hasOpened) {
    items.push({
      id: "opened",
      at: kase.openedAt,
      icon: <Flag />,
      tone: "buyer",
      title: `${kase.buyer.name} opened ${kase.stage === "inquiry" ? "an inquiry" : `a ${STAGE[kase.stage].toLowerCase()}`}: ${REASON[kase.reason].toLowerCase()}`,
      detail: kase.buyerClaim,
      quote: true,
    });
  }
  if (!eventMessages) {
    kase.messages.forEach((m) => {
      if (m.from === "buyer" && m.text.trim() === kase.buyerClaim.trim()) return;
      items.push({
        id: `msg-${m.id}`,
        at: m.at,
        icon: <MessageSquareText />,
        tone: m.from === "buyer" ? "buyer" : m.from === "seller" ? "seller" : "neutral",
        title: m.from === "buyer" ? kase.buyer.name : m.from === "seller" ? "You" : "PayPal",
        detail: m.text,
        quote: true,
      });
    });
  }

  for (const e of events) {
    items.push({
      id: `event-${e.id}`,
      at: e.at,
      icon: EVENT_ICON[e.kind] ?? <Sparkles />,
      tone:
        e.actor === "truce"
          ? "truce"
          : e.actor === "buyer"
            ? "buyer"
            : e.actor === "seller"
              ? "seller"
              : e.kind === "closed"
                ? "good"
                : "neutral",
      title: e.title,
      detail: e.detail,
      quote: e.kind === "message" || e.kind === "buyer_reply",
      simulated: e.simulated,
    });
  }

  return items.sort((a, b) => a.at.localeCompare(b.at));
}

const EVENT_ICON: Partial<Record<CaseEvent["kind"], ReactNode>> = {
  opened: <Flag />,
  message: <MessageSquareText />,
  analysis: <Sparkles />,
  approved: <ThumbsUp />,
  sent: <Send />,
  evidence: <Send />,
  offer: <Send />,
  buyer_reply: <MessageSquareText />,
  escalated: <TriangleAlert />,
  decided: <Gavel />,
  closed: <CircleCheck />,
  note: <Sparkles />,
};

const DOT: Record<Tone, string> = {
  neutral: "bg-paper text-ink-3 ring-line",
  good: "bg-lemon text-ink ring-[#cfdf7f]",
  warn: "bg-warn-50 text-warn-700 ring-warn-200",
  buyer: "bg-paper text-ink-2 ring-line-strong",
  truce: "bg-ink text-lemon ring-ink",
  seller: "bg-mist text-moss-deep ring-[#e3eab8]",
};

const COLLAPSE_AT = 9;

export function Timeline({ items }: { items: Item[] }) {
  const now = useNow();
  const [expanded, setExpanded] = useState(false);
  const hidden = !expanded && items.length > COLLAPSE_AT ? items.length - 6 : 0;
  const head = hidden ? items.slice(0, 2) : items;
  const tail = hidden ? items.slice(items.length - 4) : [];

  const row = (item: Item) => (
    <motion.li
      key={item.id}
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: duration.base, ease: ease.out }}
      className="relative flex gap-3.5 pb-5 last:pb-0"
    >
      <span
        className={cn(
          "relative z-[1] flex size-[27px] shrink-0 items-center justify-center rounded-full ring-1 [&_svg]:size-3.5",
          DOT[item.tone],
        )}
      >
        {item.icon}
      </span>
      <div className="min-w-0 flex-1 pt-[3px]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-ink text-[13.5px] leading-snug font-medium">{item.title}</p>
          <time dateTime={item.at} className="text-ink-3 text-xs tabular-nums">
            {formatDateTime(item.at, now)}
          </time>
        </div>
        {item.detail &&
          (item.quote ? (
            <p className="bg-cream text-ink mt-1.5 rounded-[10px] rounded-tl-[3px] px-3 py-2 text-[13px] leading-relaxed">
              {item.detail}
            </p>
          ) : (
            <p className="text-ink-2 mt-0.5 text-[13px] leading-relaxed">{item.detail}</p>
          ))}
        {item.simulated && (
          <Chip tone="outline" size="sm" className="mt-1.5">
            Simulated in this demo copy
          </Chip>
        )}
      </div>
    </motion.li>
  );

  return (
    <ol className="relative">
      <span aria-hidden className="bg-line absolute top-3 bottom-3 left-[13px] w-px" />
      <AnimatePresence initial={false}>
        {head.map(row)}
        {hidden > 0 && (
          <motion.li
            key="more"
            layout="position"
            exit={{ opacity: 0 }}
            className="relative flex gap-3.5 pb-5"
          >
            <span className="relative z-[1] flex size-[27px] shrink-0 items-center justify-center">
              <span className="bg-ink-3 size-1.5 rounded-full" />
            </span>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="border-line bg-paper text-ink-2 hover:border-line-strong hover:text-ink rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            >
              Show {hidden} more
            </button>
          </motion.li>
        )}
        {tail.map(row)}
      </AnimatePresence>
    </ol>
  );
}
