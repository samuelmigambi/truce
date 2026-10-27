"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  MapPin,
  PackageCheck,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { OrderWithChecks } from "@/lib/api-types";
import { errorMessage } from "@/lib/client/api";
import { formatDate } from "@/lib/client/format";
import { useOrders, useSession } from "@/lib/client/hooks";
import { ORDER_STATUS } from "@/lib/client/labels";
import { useNow } from "@/lib/client/now";
import { formatUsd } from "@/lib/money";
import { duration, ease, spring } from "../../motion";
import { Button } from "../../ui/button";
import { Chip } from "../../ui/chip";
import { cn } from "../../ui/cn";
import { EmptyState } from "../../ui/empty-state";
import { SegmentedControl } from "../../ui/segmented";
import { Skeleton } from "../../ui/skeleton";
import { PageHeader, Screen } from "../page-header";
import { FlaggedOrder } from "./flagged-order";
import { TrackingDialog } from "./tracking-dialog";

type View = "to_ship" | "all";
const PAGE = 25;

const toShip = (o: OrderWithChecks) =>
  o.status === "paid" || (o.status === "label_created" && !o.tracking);

function sortOrders(orders: OrderWithChecks[]): OrderWithChecks[] {
  return [...orders].sort((a, b) => {
    const ship = Number(toShip(b)) - Number(toShip(a));
    if (ship) return ship;
    return toShip(a) ? a.placedAt.localeCompare(b.placedAt) : b.placedAt.localeCompare(a.placedAt);
  });
}

/** Orders, to-ship first, with the checks that keep each one protected before it leaves. */
export function OrdersScreen() {
  const { data, error, mutate } = useOrders();
  const shopName = useSession().data?.workspace.shopName ?? "Wick & Ember";
  const focus = useSearchParams().get("order");
  const [view, setView] = useState<View>("to_ship");
  const [limit, setLimit] = useState(PAGE);
  const [tracking, setTracking] = useState<OrderWithChecks | null>(null);

  const orders = sortOrders(data?.orders ?? []);
  const shipping = orders.filter(toShip);
  const flagged = shipping.filter((o) => !o.checks.covered);
  const focused = focus ? orders.find((o) => o.id === focus) : undefined;
  const effectiveView: View = focused && !toShip(focused) ? "all" : view;
  const list = effectiveView === "to_ship" ? shipping : orders;
  const shown = effectiveView === "all" && !focused ? list.slice(0, limit) : list;

  useEffect(() => {
    if (!focus || !data) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById(`order-${focus}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [focus, data]);

  return (
    <Screen>
      <PageHeader
        title="Orders"
        description="Checked before they ship, so every one stays covered by Seller Protection"
      />

      {error && !data ? (
        <div className="rounded-card border-line bg-paper mt-8 border">
          <EmptyState
            tone="error"
            icon={<RotateCcw />}
            title="Couldn't load your orders"
            description={errorMessage(error)}
            action={<Button onClick={() => void mutate()}>Try again</Button>}
          />
        </div>
      ) : !data ? (
        <OrdersSkeleton />
      ) : (
        <>
          {flagged.length > 0 && (
            <div className="mt-6 space-y-4">
              {flagged.map((o, i) => (
                <FlaggedOrder key={o.id} order={o} shopName={shopName} index={i} />
              ))}
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <SegmentedControl
              label="Which orders"
              value={effectiveView}
              onChange={setView}
              options={[
                { value: "to_ship", label: "To ship", count: shipping.length },
                { value: "all", label: "All orders", count: orders.length },
              ]}
            />
            <p className="text-ink-2 text-[13px]">
              {flagged.length === 0
                ? shipping.length
                  ? "Every order to ship is protected as it stands"
                  : "Nothing waiting to ship"
                : `${flagged.length} ${flagged.length === 1 ? "order needs" : "orders need"} a look before shipping`}
            </p>
          </div>

          <div className="rounded-card border-line bg-paper mt-4 overflow-hidden border">
            {list.length === 0 ? (
              <EmptyState
                icon={<PackageCheck />}
                title="All shipped"
                description="New orders show up here with their checks as soon as they're paid."
              />
            ) : (
              <>
                <div className="border-line-soft text-ink-3 hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_88px_minmax(0,1.5fr)_minmax(0,1.2fr)] gap-4 border-b px-5 py-2.5 text-xs font-medium lg:grid">
                  <span>Order</span>
                  <span>Items</span>
                  <span className="text-right">Amount</span>
                  <span>Protection</span>
                  <span>Shipping</span>
                </div>
                <ul className="divide-line-soft divide-y">
                  <AnimatePresence initial={false} mode="popLayout">
                    {shown.map((o, i) => (
                      <motion.li
                        key={o.id}
                        id={`order-${o.id}`}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          transition: {
                            duration: duration.base,
                            ease: ease.out,
                            delay: Math.min(i, 12) * 0.025,
                          },
                        }}
                        exit={{ opacity: 0, transition: { duration: duration.fast } }}
                        transition={spring.layout}
                        className="scroll-mt-24"
                      >
                        <OrderRow
                          order={o}
                          focused={o.id === focus}
                          onAddTracking={() => setTracking(o)}
                        />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
                {effectiveView === "all" && !focused && list.length > shown.length && (
                  <button
                    type="button"
                    onClick={() => setLimit((l) => l + PAGE)}
                    className="border-line-soft text-ink-2 hover:bg-cream hover:text-ink flex w-full items-center justify-center gap-1.5 border-t py-3 text-[13px] font-medium transition-colors"
                  >
                    <ChevronDown className="size-4" />
                    Show {Math.min(PAGE, list.length - shown.length)} more of{" "}
                    {list.length - shown.length}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      <TrackingDialog order={tracking} onClose={() => setTracking(null)} />
    </Screen>
  );
}

function OrderRow({
  order,
  focused,
  onAddTracking,
}: {
  order: OrderWithChecks;
  focused: boolean;
  onAddTracking: () => void;
}) {
  const now = useNow();
  const eligible = order.checks.checks.find((c) => c.id === "eligibility");
  const address = order.checks.checks.find((c) => c.id === "address");
  const shipping = toShip(order);

  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 px-4 py-4 transition-colors duration-500 sm:px-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_88px_minmax(0,1.5fr)_minmax(0,1.2fr)] lg:items-center",
        focused && "bg-mist/70",
      )}
    >
      <div className="min-w-0">
        <p className="text-ink flex items-center gap-2 text-[14px] font-medium">
          {order.id}
          {order.caseId && (
            <Link href={`/app/cases/${encodeURIComponent(order.caseId)}`} className="inline-flex">
              <Chip tone="warn" size="sm">
                Dispute
              </Chip>
            </Link>
          )}
        </p>
        <p className="text-ink-2 truncate text-[13px]">
          {order.buyer.name} · {formatDate(order.placedAt, now)}
        </p>
      </div>

      <p className="text-ink text-right text-[14px] font-medium tabular-nums lg:order-3">
        {formatUsd(order.amount)}
      </p>

      <p className="text-ink-2 col-span-2 truncate text-[13px] lg:order-2 lg:col-span-1">
        {order.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")}
      </p>

      <div className="col-span-2 flex flex-wrap items-center gap-1.5 lg:order-4 lg:col-span-1">
        <CheckChip
          ok={eligible?.ok ?? false}
          okLabel="Eligible"
          badLabel="Not eligible"
          icon={eligible?.ok ? <ShieldCheck /> : <ShieldX />}
          title={eligible?.label}
        />
        <CheckChip
          ok={address?.ok ?? false}
          okLabel="Address matches"
          badLabel="Address differs"
          icon={<MapPin />}
          title={address?.label}
        />
      </div>

      <div className="col-span-2 flex items-center justify-between gap-3 lg:order-5 lg:col-span-1">
        {order.tracking ? (
          <span className="text-ink-2 flex min-w-0 items-center gap-2 text-[13px]">
            <Truck className="text-ink-3 size-4 shrink-0" />
            <span className="truncate tabular-nums">
              {order.tracking.carrier} {order.tracking.number}
            </span>
            {order.tracking.uploaded && (
              <span
                title="Added to the PayPal order"
                className="bg-lemon flex size-4 shrink-0 items-center justify-center rounded-full"
              >
                <Check className="text-ink size-2.5" strokeWidth={3} />
              </span>
            )}
          </span>
        ) : shipping ? (
          <Button
            size="sm"
            variant={order.checks.covered ? "primary" : "secondary"}
            icon={<Plus />}
            onClick={onAddTracking}
          >
            Add tracking
          </Button>
        ) : (
          <span className="text-ink-3 text-[13px]">No tracking</span>
        )}
        <Chip
          tone={shipping ? "lemon" : order.status === "refunded" ? "neutral" : "outline"}
          size="sm"
          dot={shipping}
        >
          {ORDER_STATUS[order.status]}
        </Chip>
      </div>
    </div>
  );
}

function CheckChip({
  ok,
  okLabel,
  badLabel,
  icon,
  title,
}: {
  ok: boolean;
  okLabel: string;
  badLabel: string;
  icon: React.ReactNode;
  title?: string;
}) {
  return (
    <span title={title}>
      <Chip tone={ok ? "moss" : "warn"} size="sm" icon={ok ? icon : <CircleAlert />}>
        {ok ? okLabel : badLabel}
      </Chip>
    </span>
  );
}

function OrdersSkeleton() {
  return (
    <div className="mt-8 space-y-4">
      <Skeleton className="rounded-btn h-9 w-56" />
      <div className="divide-line-soft rounded-card border-line bg-paper divide-y overflow-hidden border">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-6 px-5 py-4">
            <div className="w-40 space-y-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="rounded-chip h-5 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}
