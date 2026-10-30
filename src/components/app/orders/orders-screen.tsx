"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  MapPin,
  PackageCheck,
  PackageSearch,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { OrderWithChecks } from "@/lib/api-types";
import { errorMessage, shopHref } from "@/lib/client/api";
import { useOrders } from "@/lib/client/hooks";
import { ORDER_STATUS, trackingBlocker } from "@/lib/client/labels";
import { useMoney, useShop, useShopDates } from "@/lib/client/shop-context";
import { duration, ease, spring } from "../../motion";
import { Button, ButtonLink } from "../../ui/button";
import { Chip } from "../../ui/chip";
import { cn } from "../../ui/cn";
import { EmptyState } from "../../ui/empty-state";
import { Notice } from "../../ui/notice";
import { SegmentedControl } from "../../ui/segmented";
import { Skeleton } from "../../ui/skeleton";
import { Tooltip } from "../../ui/tooltip";
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

/**
 * Orders, to-ship first, with the checks that keep each one protected before it leaves. When the
 * shop's PayPal app has no Transaction Search, Truce only knows the orders that have a dispute,
 * so the screen says so instead of pretending to check shipments it can't see.
 */
export function OrdersScreen() {
  const shop = useShop();
  const { data, error, mutate } = useOrders();
  const focus = useSearchParams().get("order");
  const [view, setView] = useState<View>("to_ship");
  const [limit, setLimit] = useState(PAGE);
  const [tracking, setTracking] = useState<OrderWithChecks | null>(null);

  const partial = (data?.history ?? shop.orderHistory) === "disputes";
  const orders = sortOrders(data?.orders ?? []);
  const shipping = partial ? [] : orders.filter(toShip);
  const flagged = shipping.filter((o) => !o.checks.covered);
  const focused = focus ? orders.find((o) => o.id === focus) : undefined;
  const effectiveView: View = partial || (focused && !toShip(focused)) ? "all" : view;
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
      <PageHeader title="Orders" />

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
          {partial && <HistoryNotice />}

          {flagged.length > 0 && (
            <div className="mt-6 space-y-4">
              {flagged.map((o, i) => (
                <FlaggedOrder key={o.id} order={o} index={i} />
              ))}
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            {partial ? (
              <p className="text-ink text-sm font-medium">
                {orders.length} {orders.length === 1 ? "order" : "orders"} with a dispute
              </p>
            ) : (
              <>
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
              </>
            )}
          </div>

          <div className="rounded-card border-line bg-paper mt-4 overflow-hidden border">
            {list.length === 0 ? (
              partial ? (
                <EmptyState
                  icon={<PackageSearch />}
                  title="No orders with disputes"
                  description="When a buyer opens a dispute, its order shows up here with everything PayPal knows about it."
                />
              ) : orders.length === 0 ? (
                <EmptyState
                  icon={<PackageSearch />}
                  title="No orders yet"
                  description="New PayPal orders show up here with their checks as soon as they're paid."
                />
              ) : (
                <EmptyState
                  icon={<PackageCheck />}
                  title="All shipped"
                  description="New orders show up here with their checks as soon as they're paid."
                />
              )
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
                          shippable={!partial && toShip(o)}
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

/** Transaction Search is off for the shop's PayPal app: what that means, and how to turn it on. */
function HistoryNotice() {
  const shop = useShop();
  return (
    <Notice
      className="mt-6"
      icon={<PackageSearch />}
      title="Truce only sees the orders that have a dispute"
      action={
        <ButtonLink href={shopHref(shop.id, "settings#paypal")} size="sm" variant="secondary">
          Open PayPal settings
        </ButtonLink>
      }
    >
      Transaction Search is off for this PayPal app, so Truce can&rsquo;t check orders before they
      ship or work out the claims ratio. To turn it on, open the app in PayPal&rsquo;s developer
      dashboard (Apps &amp; Credentials), tick <span className="text-ink">Transaction search</span>{" "}
      under its features, then check the connection in settings.
    </Notice>
  );
}

function OrderRow({
  order,
  focused,
  shippable,
  onAddTracking,
}: {
  order: OrderWithChecks;
  focused: boolean;
  /** It's waiting to ship, and Truce sees the whole order history. */
  shippable: boolean;
  onAddTracking: () => void;
}) {
  const shop = useShop();
  const dates = useShopDates();
  const money = useMoney();
  const eligible = order.checks.checks.find((c) => c.id === "eligibility");
  const address = order.checks.checks.find((c) => c.id === "address");
  const blocked = trackingBlocker(shop);
  // A sample shop only records tracking; a real one sends it to PayPal.
  const uploadedLabel =
    shop.kind === "sample" ? "Recorded on the order" : "Added to the PayPal order";

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
            <Link
              href={shopHref(shop.id, `cases/${encodeURIComponent(order.caseId)}`)}
              className="inline-flex rounded-[8px]"
              aria-label={`Open the dispute on ${order.id}`}
            >
              <Chip tone="warn" size="sm">
                Dispute
              </Chip>
            </Link>
          )}
        </p>
        <p className="text-ink-2 truncate text-[13px]">
          {order.buyer.name} · {dates.date(order.placedAt)}
        </p>
      </div>

      <p className="text-ink text-right text-[14px] font-medium tabular-nums lg:order-3">
        {money(order.amount)}
      </p>

      <p className="text-ink-2 col-span-2 truncate text-[13px] lg:order-2 lg:col-span-1">
        {order.items.map((i) => `${i.quantity} × ${i.name}`).join(", ") || "Items not listed"}
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
                title={uploadedLabel}
                className="bg-lemon flex size-4 shrink-0 items-center justify-center rounded-full"
              >
                <Check className="text-ink size-2.5" strokeWidth={3} />
                <span className="sr-only">{uploadedLabel}</span>
              </span>
            )}
          </span>
        ) : shippable ? (
          blocked ? (
            <Tooltip content={blocked}>
              <span tabIndex={0} className="rounded-btn inline-flex">
                <Button size="sm" variant="secondary" disabled>
                  Add tracking
                </Button>
              </span>
            </Tooltip>
          ) : (
            <Button
              size="sm"
              variant={order.checks.covered ? "primary" : "secondary"}
              onClick={onAddTracking}
            >
              Add tracking
            </Button>
          )
        ) : (
          <span className="text-ink-3 text-[13px]">No tracking</span>
        )}
        <Chip
          tone={shippable ? "lemon" : order.status === "refunded" ? "neutral" : "outline"}
          size="sm"
          dot={shippable}
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
    <div className="mt-8 space-y-4" aria-busy="true" aria-label="Loading the orders">
      <Skeleton className="rounded-btn h-9 w-56" />
      <div className="divide-line-soft rounded-card border-line bg-paper divide-y overflow-hidden border">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-6 px-5 py-4">
            <div className="w-40 space-y-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="rounded-chip h-5 w-40 max-sm:hidden" />
          </div>
        ))}
      </div>
    </div>
  );
}
