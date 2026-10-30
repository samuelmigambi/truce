"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  ChevronRight,
  CircleCheck,
  Inbox as InboxIcon,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { CaseSummary } from "@/lib/api-types";
import type { CaseStatus } from "@/lib/domain";
import { useRunningAnalyses, type AnalysisRun } from "@/lib/client/analysis";
import { errorMessage, shopHref } from "@/lib/client/api";
import { useCases, useMetrics } from "@/lib/client/hooks";
import { headlineWithoutMove, STATUS } from "@/lib/client/labels";
import { useMoney, useShop } from "@/lib/client/shop-context";
import { startSweep, useSweep } from "@/lib/client/sweep";
import { duration, ease, spring } from "../../motion";
import { Avatar } from "../../ui/avatar";
import { Button } from "../../ui/button";
import { cn } from "../../ui/cn";
import { EmptyState } from "../../ui/empty-state";
import { ThinkingMark } from "../../ui/logo";
import { Money } from "../../ui/money";
import { SegmentedControl } from "../../ui/segmented";
import { Skeleton } from "../../ui/skeleton";
import { DueLabel, MoveChip, OutcomeChip, ReasonChip, StageChip } from "../case-chips";
import { Kpi, KpiSkeleton } from "../kpi";
import { PageHeader, Screen } from "../page-header";
import { SweepPanel } from "./sweep-panel";

const FILTERS: CaseStatus[] = ["needs_you", "waiting_buyer", "with_paypal", "closed"];

function sortCases(cases: CaseSummary[], status: CaseStatus): CaseSummary[] {
  const list = cases.filter((c) => c.status === status);
  if (status === "closed")
    return list.sort((a, b) =>
      (b.closedAt ?? b.updatedAt).localeCompare(a.closedAt ?? a.updatedAt),
    );
  if (status === "needs_you") {
    return list.sort(
      (a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") || b.amount - a.amount,
    );
  }
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * The tab to open on: "Needs you" when anything does, else the first tab with cases in it, so a
 * shop whose disputes all sit with PayPal doesn't open on an empty list.
 */
function firstFilter(cases: CaseSummary[]): CaseStatus {
  return FILTERS.find((f) => cases.some((c) => c.status === f)) ?? "needs_you";
}

/** The inbox: what's at stake, what needs the seller, and the overnight check on demand. */
export function CasesInbox() {
  const shop = useShop();
  const { data, error, mutate } = useCases();
  const sweep = useSweep(shop.id);
  // Until the seller picks a tab, the inbox opens where the cases are.
  const [chosen, setChosen] = useState<CaseStatus | null>(null);
  const cases = data?.cases ?? [];
  const filter = chosen ?? (data ? firstFilter(cases) : "needs_you");
  const setFilter = setChosen;
  const visible = sortCases(cases, filter);

  return (
    <Screen>
      <PageHeader
        title="Cases"
        actions={
          <Button
            variant="secondary"
            onClick={() => startSweep(shop.id)}
            loading={sweep.status === "running"}
          >
            {sweep.status === "running" ? "Checking" : "Run overnight check"}
          </Button>
        }
      />

      <div className="mt-6">
        <SweepPanel />
      </div>

      <SummaryStrip />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Filter cases"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => {
            const count = cases.filter((c) => c.status === f).length;
            return {
              value: f,
              label: STATUS[f],
              count: data && (count > 0 || f === filter) ? count : undefined,
            };
          })}
        />
      </div>

      <div className="mt-4">
        {error && !data ? (
          <div className="rounded-card border-line bg-paper border">
            <EmptyState
              tone="error"
              icon={<RotateCcw />}
              title="Couldn't load your cases"
              description={errorMessage(error)}
              action={<Button onClick={() => void mutate()}>Try again</Button>}
            />
          </div>
        ) : !data ? (
          <ListSkeleton />
        ) : (
          <CaseList cases={visible} filter={filter} none={cases.length === 0} />
        )}
      </div>
    </Screen>
  );
}

function SummaryStrip() {
  const { data, error, mutate } = useMetrics();
  if (error && !data) {
    return (
      <div className="rounded-card border-line bg-paper flex flex-wrap items-center justify-between gap-3 border px-5 py-4">
        <p className="text-ink-2 text-sm">The numbers didn&rsquo;t load: {errorMessage(error)}</p>
        <Button size="sm" variant="secondary" onClick={() => void mutate()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="grid grid-cols-3 gap-3 sm:gap-4" aria-busy="true">
        <KpiSkeleton hint={false} roomy />
        <KpiSkeleton hint={false} roomy />
        <KpiSkeleton hint={false} roomy />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      {/* Phones get the short words, so three tiles fit side by side without cutting any off. */}
      <Kpi
        index={0}
        roomy
        label={
          <>
            <span className="sm:hidden">At risk</span>
            <span className="max-sm:hidden">Money at risk</span>
          </>
        }
        value={<Money cents={data.moneyAtRisk} animate />}
      />
      <Kpi
        index={1}
        roomy
        label={
          <>
            Due<span className="max-sm:hidden"> this week</span>
            <span className="sm:hidden"> soon</span>
          </>
        }
        value={data.dueSoon}
      />
      <Kpi
        index={2}
        roomy
        label={
          <>
            Kept<span className="max-sm:hidden"> this month</span>
          </>
        }
        value={<Money cents={data.kept} animate delay={0.1} />}
      />
    </div>
  );
}

const EMPTY: Record<CaseStatus, { title: string; body: string }> = {
  needs_you: {
    title: "Nothing needs you",
    body: "Every open case is waiting on a buyer or on PayPal. New disputes land here first.",
  },
  waiting_buyer: {
    title: "No one to wait for",
    body: "Cases you've answered move here while the buyer decides.",
  },
  with_paypal: {
    title: "Nothing with PayPal",
    body: "Claims you've sent evidence for wait here for PayPal's decision.",
  },
  closed: {
    title: "No closed cases yet",
    body: "Finished cases, and what each one kept or cost, collect here.",
  },
};

function CaseList({
  cases,
  filter,
  none,
}: {
  cases: CaseSummary[];
  filter: CaseStatus;
  /** The shop has no cases at all yet. */
  none: boolean;
}) {
  const shop = useShop();
  const running = useRunningAnalyses(shop.id);
  const fresh = none && filter === "needs_you";
  return (
    <div className="rounded-card border-line bg-paper overflow-hidden border">
      <AnimatePresence mode="popLayout" initial={false}>
        {cases.length === 0 ? (
          <motion.div
            key={`empty-${filter}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {fresh ? (
              <EmptyState
                icon={<ShieldCheck />}
                title="No disputes"
                description={
                  shop.kind === "real"
                    ? "Truce checks PayPal for new disputes as they arrive, and again every night. When a buyer opens one, it lands here with Truce's read and a draft for you to approve."
                    : "Every case in this sample shop is settled. Start the sample over to see them again."
                }
              />
            ) : (
              <EmptyState
                icon={filter === "needs_you" ? <CircleCheck /> : <InboxIcon />}
                title={EMPTY[filter].title}
                description={EMPTY[filter].body}
              />
            )}
          </motion.div>
        ) : (
          <motion.ul key={filter} className="divide-line divide-y">
            {cases.map((c, i) => (
              <motion.li
                key={c.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { duration: duration.base, ease: ease.out, delay: i * 0.03 },
                }}
                exit={{ opacity: 0, transition: { duration: duration.fast } }}
                transition={spring.layout}
              >
                <CaseRow
                  kase={c}
                  analyzing={running[c.id]?.status === "running"}
                  step={activeLabel(running[c.id])}
                />
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function activeLabel(run: AnalysisRun | undefined): string | null {
  if (!run || run.status !== "running") return null;
  return run.steps.find((s) => s.state === "active")?.label ?? "Starting";
}

function CaseRow({
  kase,
  analyzing,
  step,
}: {
  kase: CaseSummary;
  analyzing: boolean;
  step: string | null;
}) {
  const shop = useShop();
  const money = useMoney();
  const closed = kase.status === "closed";
  return (
    <Link
      href={shopHref(shop.id, `cases/${encodeURIComponent(kase.id)}`)}
      className="group hover:bg-cream/70 grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-3 px-4 py-4 transition-colors focus-visible:-outline-offset-2 sm:px-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1.6fr)_auto] lg:items-center"
    >
      {/* Who and what */}
      <div className="flex min-w-0 items-start gap-3">
        <Avatar name={kase.buyer.name} />
        <div className="min-w-0">
          <p className="text-ink truncate text-[15px] font-medium">{kase.buyer.name}</p>
          <p className="text-ink-2 truncate text-[13px]">{kase.itemSummary}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ReasonChip reason={kase.reason} size="sm" />
            <StageChip stage={kase.stage} size="sm" />
          </div>
        </div>
      </div>

      {/* Amount and deadline (right on phones, last on desktop) */}
      <div className="flex flex-col items-end gap-1 text-right lg:order-last lg:min-w-[150px]">
        <p className="text-ink text-[15px] font-semibold tabular-nums">{money(kase.amount)}</p>
        {closed ? (
          <ClosedNote kase={kase} />
        ) : (
          <span className="flex items-center gap-2">
            <DueLabel dueAt={kase.dueAt} />
            <ChevronRight className="text-ink-3 size-4 transition-transform group-hover:translate-x-0.5 max-lg:hidden" />
          </span>
        )}
      </div>

      {/* Truce's read; a case that closed without one keeps the column on desktop, empty */}
      <div
        className={cn(
          "col-span-2 min-w-0 lg:col-span-1",
          closed && !kase.recommendation && !analyzing && "max-lg:hidden",
        )}
      >
        <TruceRead kase={kase} analyzing={analyzing} step={step} />
      </div>
    </Link>
  );
}

function ClosedNote({ kase }: { kase: CaseSummary }) {
  const money = useMoney();
  return (
    <span className="flex items-center gap-2">
      {kase.outcome && <OutcomeChip outcome={kase.outcome} size="sm" />}
      {kase.feeCharged > 0 ? (
        <span className="text-risk-700 text-[13px] tabular-nums">{money(kase.feeCharged)} fee</span>
      ) : kase.moneyKept > 0 ? (
        <span className="text-moss-deep text-[13px] tabular-nums">
          Kept {money(kase.moneyKept)}
        </span>
      ) : null}
    </span>
  );
}

function TruceRead({
  kase,
  analyzing,
  step,
}: {
  kase: CaseSummary;
  analyzing: boolean;
  step: string | null;
}) {
  if (analyzing) {
    return (
      <div className="shimmer shimmer-lemon bg-mist/60 flex items-center gap-2.5 rounded-[10px] px-3 py-2">
        <ThinkingMark className="size-5" tile={false} />
        <span className="text-ink truncate text-[13px] font-medium">Analyzing</span>
        <span className="text-ink-2 truncate text-[13px]">{step}</span>
      </div>
    );
  }
  if (!kase.recommendation) {
    // A case that ended without Truce says how it ended on the right; nothing to add here.
    if (kase.status === "closed") return null;
    return (
      <p className="text-ink-3 flex items-center gap-2 text-[13px]">
        <Sparkles className="size-3.5" />
        Opens with a live analysis
      </p>
    );
  }
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <MoveChip move={kase.recommendation.move} size="sm" className="mt-px" />
      <div className="min-w-0">
        <p className="text-ink line-clamp-2 text-[13px] leading-snug lg:line-clamp-1">
          {headlineWithoutMove(kase.recommendation.headline)}
        </p>
        {kase.status === "needs_you" && (
          <p className="text-moss-deep mt-1 flex items-center gap-1.5 text-xs">
            <span className="bg-moss size-1.5 rounded-full" />
            Ready for you · {kase.recommendation.confidence} confidence
          </p>
        )}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div
      className="divide-line rounded-card border-line bg-paper divide-y overflow-hidden border"
      aria-busy="true"
      aria-label="Loading the cases"
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4 lg:grid-cols-[1.25fr_1.6fr_auto]"
        >
          <div className="flex gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
          <Skeleton className="h-4 w-14 lg:order-last" />
          <Skeleton className="col-span-2 h-4 w-3/4 lg:col-span-1" />
        </div>
      ))}
    </div>
  );
}
