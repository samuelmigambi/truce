"use client";

import { Clock, Gavel, Handshake, Undo2 } from "lucide-react";
import type { CaseOutcome, CaseStatus, DisputeReason, DisputeStage, Move } from "@/lib/domain";
import { MOVE, OUTCOME, REASON, STAGE, STATUS, URGENCY_TONE } from "@/lib/client/labels";
import { useNow } from "@/lib/client/now";
import { dueLabel, urgency } from "@/lib/rules/deadlines";
import { Chip, type Tone } from "../ui/chip";
import { cn } from "../ui/cn";

const MOVE_TONE: Record<Move, Tone> = { fight: "ink", settle: "mist", refund: "outline" };
const MOVE_ICON: Record<Move, React.ReactNode> = {
  fight: <Gavel />,
  settle: <Handshake />,
  refund: <Undo2 />,
};

export function MoveChip({
  move,
  size = "md",
  className,
  label,
}: {
  move: Move;
  size?: "sm" | "md";
  className?: string;
  label?: string;
}) {
  return (
    <Chip tone={MOVE_TONE[move]} size={size} icon={MOVE_ICON[move]} className={className}>
      {label ?? MOVE[move]}
    </Chip>
  );
}

const STATUS_TONE: Record<CaseStatus, Tone> = {
  needs_you: "lemon",
  waiting_buyer: "outline",
  with_paypal: "neutral",
  closed: "neutral",
};

export function StatusChip({ status, size = "md" }: { status: CaseStatus; size?: "sm" | "md" }) {
  return (
    <Chip tone={STATUS_TONE[status]} size={size} dot={status !== "closed"}>
      {STATUS[status]}
    </Chip>
  );
}

export function StageChip({ stage, size = "md" }: { stage: DisputeStage; size?: "sm" | "md" }) {
  return (
    <Chip tone="outline" size={size}>
      {STAGE[stage]}
    </Chip>
  );
}

export function ReasonChip({ reason, size = "md" }: { reason: DisputeReason; size?: "sm" | "md" }) {
  return (
    <Chip tone="neutral" size={size}>
      {REASON[reason]}
    </Chip>
  );
}

const OUTCOME_TONE: Record<CaseOutcome, Tone> = {
  won: "lemon",
  buyer_closed: "lemon",
  settled: "mist",
  refunded: "neutral",
  lost: "risk",
};

export function OutcomeChip({
  outcome,
  size = "md",
}: {
  outcome: CaseOutcome;
  size?: "sm" | "md";
}) {
  return (
    <Chip tone={OUTCOME_TONE[outcome]} size={size}>
      {OUTCOME[outcome]}
    </Chip>
  );
}

const DUE_TEXT = { risk: "text-risk-700", warn: "text-warn-700", neutral: "text-ink-2" } as const;

/** "Due in 3 days", colored by how close PayPal's deadline is. */
export function DueLabel({
  dueAt,
  size = "sm",
  className,
}: {
  dueAt: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const now = useNow();
  const text = size === "md" ? "text-[15px]" : "text-[13px]";
  if (!dueAt) return <span className={cn("text-ink-3", text, className)}>No deadline</span>;
  const due = new Date(dueAt);
  const tone = URGENCY_TONE[urgency(due, new Date(now))];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium whitespace-nowrap",
        text,
        DUE_TEXT[tone],
        className,
      )}
    >
      <Clock className={size === "md" ? "size-4" : "size-3.5"} />
      {dueLabel(due, new Date(now))}
    </span>
  );
}
