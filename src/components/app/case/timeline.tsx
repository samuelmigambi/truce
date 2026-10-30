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
import type { Case, CaseEvent, Order, Shop } from "@/lib/domain";
import { REASON, STAGE, tidyPlace, TRACKING_STATUS } from "@/lib/client/labels";
import { useShopDates } from "@/lib/client/shop-context";
import { formatMoney } from "@/lib/money";
import { duration, ease } from "../../motion";
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
  /** Show only the day: PayPal records some things, such as shipping, by date alone. */
  dayOnly?: boolean;
}

/** A day PayPal gives as "2026-10-27" means that calendar day: noon UTC keeps it in every zone. */
function dayInstant(day: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T12:00:00.000Z` : day;
}

/** The later of two instants, so a shipment dated by day never lands before its own payment. */
function later(a: string, b: string): string {
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

/**
 * The story of the order, from checkout to today: the payment, the shipment, the dispute, the
 * messages, and each step taken since. A sample shop has carrier scans; a real shop has the
 * tracking on its PayPal order, since carrier scans aren't connected yet.
 */
export function buildTimeline(
  kase: Case,
  order: Order | null,
  events: CaseEvent[],
  shop: Pick<Shop, "currency">,
): Item[] {
  const items: Item[] = [];
  if (order) {
    items.push({
      id: "order",
      at: order.placedAt,
      icon: <Package />,
      tone: "neutral",
      title: `Order ${order.id} placed`,
      detail: `${order.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")} · ${formatMoney(order.amount, shop.currency)}`,
    });
    items.push({
      id: "payment",
      at: new Date(new Date(order.placedAt).getTime() + 60_000).toISOString(),
      icon: <CreditCard />,
      tone: order.protection === "ELIGIBLE" ? "good" : "neutral",
      title: "Paid with PayPal",
      detail: order.protection
        ? `Seller Protection: ${order.protection.toLowerCase().replace(/_/g, " ")}`
        : undefined,
    });
    const tracking = order.tracking;
    const scans = tracking?.events ?? [];
    if (tracking && scans.length === 0) {
      const paid = new Date(new Date(order.placedAt).getTime() + 2 * 60_000).toISOString();
      items.push({
        id: "label",
        at: tracking.shippedAt ? later(dayInstant(tracking.shippedAt), paid) : paid,
        dayOnly: Boolean(tracking.shippedAt),
        icon: <Truck />,
        tone: "neutral",
        title: tracking.shippedAt
          ? `Shipped with ${tracking.carrier}`
          : `${tracking.carrier} tracking added`,
        detail: tracking.number,
      });
      if (tracking.deliveredAt) {
        items.push({
          id: "delivered",
          at: tracking.deliveredAt,
          icon: <PackageCheck />,
          tone: "good",
          title: tracking.signedFor ? "Delivered and signed for" : "Delivered",
          detail: `${tracking.carrier} ${tracking.number}`,
        });
      }
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
      detail: e.detail && withoutApiPath(e.detail),
      quote: e.kind === "message" || e.kind === "buyer_reply",
    });
  }

  return items.sort((a, b) => a.at.localeCompare(b.at));
}

/** "Simulated in this sample shop: POST /v1/…" reads as just the first part; a bare path, as nothing. */
function withoutApiPath(detail: string): string | undefined {
  const cut = detail.replace(/:?\s*(GET|POST|PUT|PATCH|DELETE) \/v\d+\/\S*$/, "").trim();
  return cut || undefined;
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
  seller: "bg-mist text-moss-deep ring-mist-line",
};

const COLLAPSE_AT = 9;

export function Timeline({ items }: { items: Item[] }) {
  const dates = useShopDates();
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
        {/* A long title wraps beside its time, so every time sits on the right. */}
        <div className="flex items-baseline justify-between gap-x-3">
          <p className="text-ink min-w-0 text-[14px] leading-snug font-medium">{item.title}</p>
          <time dateTime={item.at} className="text-ink-3 shrink-0 text-[13px] tabular-nums">
            {item.dayOnly ? dates.date(item.at) : dates.dateTime(item.at)}
          </time>
        </div>
        {item.detail &&
          (item.quote ? (
            <p className="bg-cream text-ink mt-1.5 rounded-[10px] rounded-tl-[3px] px-3 py-2 text-[13.5px] leading-relaxed whitespace-pre-line">
              {item.detail}
            </p>
          ) : (
            <p className="text-ink-2 mt-0.5 text-[13.5px] leading-relaxed">{item.detail}</p>
          ))}
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
