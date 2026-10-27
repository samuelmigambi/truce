"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check, Package, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ChatCard } from "@/lib/api-types";
import { approveCase } from "@/lib/client/actions";
import { errorMessage } from "@/lib/client/api";
import { useCases, useOrders } from "@/lib/client/hooks";
import { MOVE, STATUS } from "@/lib/client/labels";
import { formatUsd } from "@/lib/money";
import { spring } from "../../motion";
import { Avatar } from "../../ui/avatar";
import { Button } from "../../ui/button";
import { Chip } from "../../ui/chip";
import { cn } from "../../ui/cn";
import { MoveChip, ReasonChip } from "../case-chips";

/** The cards Ask Truce can show: a case, an order, a number, or an action waiting for approval. */
export function ChatCardView({ card, onNavigate }: { card: ChatCard; onNavigate?: () => void }) {
  switch (card.kind) {
    case "case":
      return <CaseCard caseId={card.caseId} onNavigate={onNavigate} />;
    case "order":
      return <OrderCard orderId={card.orderId} onNavigate={onNavigate} />;
    case "metric":
      return (
        <div className="rounded-card border-line bg-paper inline-flex flex-col border px-4 py-3">
          <span className="text-ink-2 text-xs">{card.label}</span>
          <span className="text-ink mt-0.5 text-xl font-semibold tabular-nums">{card.value}</span>
        </div>
      );
    case "action":
      return <ActionCard card={card} onNavigate={onNavigate} />;
  }
}

const shell =
  "block rounded-card border border-line bg-paper transition-[border-color,box-shadow] duration-150";

function CaseCard({ caseId, onNavigate }: { caseId: string; onNavigate?: () => void }) {
  const kase = useCases().data?.cases.find((c) => c.id === caseId);
  if (!kase) {
    return (
      <Link
        href={`/app/cases/${encodeURIComponent(caseId)}`}
        onClick={onNavigate}
        className={cn(shell, "text-ink-2 hover:border-line-strong px-4 py-3 text-sm")}
      >
        Open case {caseId}
      </Link>
    );
  }
  return (
    <Link
      href={`/app/cases/${encodeURIComponent(kase.id)}`}
      onClick={onNavigate}
      className={cn(shell, "group hover:border-line-strong hover:shadow-lift p-3.5")}
    >
      <div className="flex items-start gap-3">
        <Avatar name={kase.buyer.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-ink truncate text-sm font-medium">{kase.buyer.name}</p>
            <p className="text-ink text-sm font-medium tabular-nums">{formatUsd(kase.amount)}</p>
          </div>
          <p className="text-ink-2 truncate text-[13px]">{kase.itemSummary}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ReasonChip reason={kase.reason} size="sm" />
            <Chip tone="outline" size="sm">
              {STATUS[kase.status]}
            </Chip>
            {kase.recommendation && <MoveChip move={kase.recommendation.move} size="sm" />}
          </div>
        </div>
        <ArrowUpRight className="text-ink-3 group-hover:text-ink size-4 shrink-0 transition-colors" />
      </div>
    </Link>
  );
}

function OrderCard({ orderId, onNavigate }: { orderId: string; onNavigate?: () => void }) {
  const order = useOrders().data?.orders.find((o) => o.id === orderId);
  const href = `/app/orders?order=${encodeURIComponent(orderId)}`;
  if (!order) {
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className={cn(shell, "text-ink-2 hover:border-line-strong px-4 py-3 text-sm")}
      >
        Open order {orderId}
      </Link>
    );
  }
  const covered = order.checks.covered;
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(shell, "group hover:border-line-strong hover:shadow-lift p-3.5")}
    >
      <div className="flex items-start gap-3">
        <span className="bg-mist text-moss-deep flex size-8 shrink-0 items-center justify-center rounded-full">
          <Package className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-ink truncate text-sm font-medium">
              {order.id} · {order.buyer.name}
            </p>
            <p className="text-ink text-sm font-medium tabular-nums">{formatUsd(order.amount)}</p>
          </div>
          <p className="text-ink-2 truncate text-[13px]">
            {order.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")}
          </p>
          <p
            className={cn(
              "mt-2 inline-flex items-center gap-1.5 text-xs font-medium",
              covered ? "text-moss-deep" : "text-warn-700",
            )}
          >
            {covered ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
            {covered
              ? "Protected if it ships as is"
              : (order.checks.checks.find((c) => !c.ok)?.label ?? "Needs a look before it ships")}
          </p>
        </div>
      </div>
    </Link>
  );
}

function ActionCard({
  card,
  onNavigate,
}: {
  card: Extract<ChatCard, { kind: "action" }>;
  onNavigate?: () => void;
}) {
  const kase = useCases().data?.cases.find((c) => c.id === card.caseId);
  const [state, setState] = useState<"idle" | "sending" | "sent">(
    kase && kase.status !== "needs_you" ? "sent" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);

  async function approve() {
    if (!kase) return;
    setState("sending");
    setError(null);
    try {
      const response = await approveCase(kase, card.move, card.draft);
      setSimulated(response.simulated);
      setState("sent");
    } catch (e) {
      setState("idle");
      setError(errorMessage(e));
    }
  }

  return (
    <div className="rounded-card border-line bg-paper overflow-hidden border">
      <div className="border-line-soft flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <MoveChip move={card.move} size="sm" />
          <p className="text-ink truncate text-sm font-medium">{card.label}</p>
        </div>
        {card.draft.offerAmount !== undefined && (
          <span className="text-ink text-sm font-medium tabular-nums">
            {formatUsd(card.draft.offerAmount)}
          </span>
        )}
      </div>
      <p className="text-ink-2 max-h-40 overflow-y-auto px-4 py-3 text-[13.5px] leading-relaxed whitespace-pre-wrap">
        {card.draft.text}
      </p>
      <div className="border-line-soft bg-cream/60 flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5">
        <Link
          href={`/app/cases/${encodeURIComponent(card.caseId)}`}
          onClick={onNavigate}
          className="text-moss text-[13px] font-medium hover:underline"
        >
          Open the case
        </Link>
        <AnimatePresence mode="wait" initial={false}>
          {state === "sent" ? (
            <motion.span
              key="sent"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1, transition: spring.pop }}
              className="text-ink inline-flex items-center gap-1.5 text-[13px] font-medium"
            >
              <span className="bg-lemon flex size-5 items-center justify-center rounded-full">
                <Check className="size-3" strokeWidth={3} />
              </span>
              {simulated ? "Approved. Simulated in this demo copy" : "Approved and sent"}
            </motion.span>
          ) : (
            <motion.span key="approve" exit={{ opacity: 0 }}>
              <Button size="sm" onClick={approve} loading={state === "sending"} disabled={!kase}>
                Approve {MOVE[card.move].toLowerCase()}
              </Button>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {error && (
        <p className="border-risk-200 bg-risk-50 text-risk-700 border-t px-4 py-2 text-[13px]">
          {error}
        </p>
      )}
    </div>
  );
}
