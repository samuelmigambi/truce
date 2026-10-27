"use client";

import { motion } from "motion/react";
import {
  Activity,
  ArrowUpRight,
  BadgeDollarSign,
  Lightbulb,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import type { Metrics } from "@/lib/api-types";
import { errorMessage } from "@/lib/client/api";
import { formatCost, formatDate, formatPercent } from "@/lib/client/format";
import { useCases, useMetrics } from "@/lib/client/hooks";
import { fullModelName, modelTier } from "@/lib/client/labels";
import { useNow } from "@/lib/client/now";
import { formatUsd } from "@/lib/money";
import { RATIO_LINE, RATIO_MIN_SALES } from "@/lib/rules/ratio";
import { duration, ease } from "../../motion";
import { Button } from "../../ui/button";
import { Card, CardBody, CardHeader } from "../../ui/card";
import { Gauge, Legend, Meter, Sparkline, StackedBars, type Series } from "../../ui/charts";
import { cn } from "../../ui/cn";
import { EmptyState } from "../../ui/empty-state";
import { ModelSwatch } from "../../ui/model-badge";
import { AnimatedNumber, Money } from "../../ui/money";
import { Skeleton } from "../../ui/skeleton";
import { Kpi, KpiSkeleton } from "../kpi";
import { PageHeader, Screen } from "../page-header";

const SERIES: Series[] = [
  { key: "not_received", label: "Not received", color: "var(--color-series-1)" },
  { key: "not_as_described", label: "Not as described", color: "var(--color-series-2)" },
  { key: "unauthorized", label: "Unauthorized", color: "var(--color-series-3)" },
  { key: "other", label: "Other", color: "var(--color-series-4)" },
];

function weeklyTotals(weekly: Metrics["weekly"]): number[] {
  return weekly.map((w) => w.not_received + w.not_as_described + w.unauthorized + w.other);
}

/** Shop health: what Truce kept, the claims ratio against PayPal's line, trends, and model spend. */
export function HealthScreen() {
  const { data, error, mutate } = useMetrics();

  return (
    <Screen>
      <PageHeader
        title="Shop health"
        description="The last 90 days of disputes, and where the shop stands with PayPal"
      />
      {error && !data ? (
        <div className="rounded-card border-line bg-paper mt-8 border">
          <EmptyState
            tone="error"
            icon={<RotateCcw />}
            title="Couldn't load the numbers"
            description={errorMessage(error)}
            action={<Button onClick={() => void mutate()}>Try again</Button>}
          />
        </div>
      ) : !data ? (
        <HealthSkeleton />
      ) : (
        <Body metrics={data} />
      )}
    </Screen>
  );
}

function Body({ metrics }: { metrics: Metrics }) {
  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Kpi
          index={0}
          label="Kept"
          icon={<TrendingUp />}
          tone="good"
          value={<Money cents={metrics.kept} animate />}
          hint="Closed cases, last 30 days"
        />
        <Kpi
          index={1}
          label="Fees avoided"
          icon={<BadgeDollarSign />}
          value={<Money cents={metrics.feesAvoided} animate delay={0.08} />}
          hint={
            metrics.feesPaid > 0
              ? `${formatUsd(metrics.feesPaid)} paid in fees`
              : "No dispute fees paid"
          }
        />
        <Kpi
          index={2}
          label="At risk"
          icon={<Wallet />}
          tone={metrics.dueSoon > 0 ? "warn" : "default"}
          value={<Money cents={metrics.moneyAtRisk} animate delay={0.16} />}
          hint={`${metrics.openCases} open ${metrics.openCases === 1 ? "case" : "cases"}, ${metrics.dueSoon} due this week`}
        />
        <Kpi
          index={3}
          label="Disputes"
          icon={<Activity />}
          value={
            <AnimatedNumber
              value={weeklyTotals(metrics.weekly).reduce((n, v) => n + v, 0)}
              format={(v) => String(Math.round(v))}
            />
          }
          hint="Opened in the last 13 weeks"
        >
          <Sparkline values={weeklyTotals(metrics.weekly)} className="mt-2" />
        </Kpi>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
        <RatioCard ratio={metrics.ratio} />
        <TrendCard weekly={metrics.weekly} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PatternsCard patterns={metrics.patterns} />
        <SpendCard spend={metrics.spend} average={metrics.averageCaseCost} />
      </div>
    </>
  );
}

function RatioCard({ ratio }: { ratio: Metrics["ratio"] }) {
  const tone = ratio.highVolume ? "risk" : ratio.headroom <= 1 ? "warn" : "good";
  const max = RATIO_LINE * 2;
  return (
    <Card>
      <CardHeader
        title="Claims ratio"
        description="Claims over sales, three months, against PayPal's 1.5% line"
      />
      <CardBody>
        <Gauge
          value={ratio.ratio}
          max={max}
          marker={{ value: RATIO_LINE, label: "1.5%" }}
          tone={tone}
          label={`Claims ratio ${formatPercent(ratio.ratio)}, PayPal's line is 1.5%`}
          className="mx-auto max-w-[300px]"
        >
          <p className="text-ink text-[34px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
            <AnimatedNumber
              value={ratio.ratio * 100}
              format={(v) => `${v.toFixed(2)}%`}
              frame={(v) => `${v.toFixed(2)}%`}
            />
          </p>
          <p className="text-ink-2 mt-1.5 text-[13px] tabular-nums">
            {ratio.claims} {ratio.claims === 1 ? "claim" : "claims"} on {ratio.sales} sales
          </p>
        </Gauge>
        <div
          className={cn(
            "mt-5 flex items-start gap-2.5 rounded-[10px] px-3.5 py-3 text-[13px] leading-relaxed",
            tone === "good" && "bg-mist text-ink",
            tone === "warn" && "bg-warn-50 text-warn-700",
            tone === "risk" && "bg-risk-50 text-risk-700",
          )}
        >
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <p>
            {ratio.highVolume
              ? "Over the line: every claim now costs the $30 high-volume fee, even the ones you win."
              : ratio.headroom === 0
                ? "One more claim would cross the line. Settling inquiries early keeps them out of the ratio."
                : `Room for ${ratio.headroom} more ${ratio.headroom === 1 ? "claim" : "claims"} before the line at today's sales.`}
            {ratio.sales <= RATIO_MIN_SALES &&
              !ratio.highVolume &&
              " The higher fee only applies above 100 sales in three months."}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

function TrendCard({ weekly }: { weekly: Metrics["weekly"] }) {
  const now = useNow();
  const total = weekly.reduce(
    (n, w) => n + w.not_received + w.not_as_described + w.unauthorized + w.other,
    0,
  );
  const data = weekly.map((w) => ({
    label: formatDate(w.weekStart, now).replace(/^(\w{3}) (\d+)$/, "$1 $2"),
    title: `Week of ${formatDate(w.weekStart, now)}`,
    values: {
      not_received: w.not_received,
      not_as_described: w.not_as_described,
      unauthorized: w.unauthorized,
      other: w.other,
    },
  }));
  return (
    <Card>
      <CardHeader title="Disputes by reason" description={`13 weeks · ${total} in all`} />
      <CardBody>
        {total === 0 ? (
          <p className="text-ink-2 py-16 text-center text-sm">No disputes in the last 13 weeks.</p>
        ) : (
          <>
            <StackedBars
              data={data}
              series={SERIES}
              label={`Disputes per week by reason, ${total} in 13 weeks`}
              height={210}
            />
            <Legend series={SERIES} className="mt-4 pl-7" />
          </>
        )}
      </CardBody>
    </Card>
  );
}

function PatternsCard({ patterns }: { patterns: Metrics["patterns"] }) {
  const cases = useCases().data?.cases;
  const nameOf = (id: string) => {
    const kase = cases?.find((c) => c.id === id);
    return kase ? kase.buyer.name : id;
  };
  return (
    <Card>
      <CardHeader title="Patterns" description="What keeps coming up, and what would prevent it" />
      <CardBody>
        {patterns.length === 0 ? (
          <p className="text-ink-2 text-sm">
            No repeating patterns yet. Truce looks again after every closed case.
          </p>
        ) : (
          <ul className="space-y-3">
            {patterns.map((p, i) => (
              <motion.li
                key={p.text}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: duration.base, ease: ease.out, delay: 0.1 + i * 0.05 }}
                className="border-line-soft flex gap-3 rounded-[10px] border p-3.5"
              >
                <span className="bg-mist text-moss-deep flex size-7 shrink-0 items-center justify-center rounded-lg">
                  <Lightbulb className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-ink text-[14px] leading-relaxed">{p.text}</p>
                  {p.caseIds.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.caseIds.map((id) => (
                        <Link
                          key={id}
                          href={`/app/cases/${encodeURIComponent(id)}`}
                          className="rounded-chip border-line bg-paper text-ink-2 hover:border-line-strong hover:text-ink inline-flex h-6 items-center gap-1 border px-2 text-xs font-medium transition-colors"
                        >
                          {nameOf(id)}
                          <ArrowUpRight className="size-3" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function SpendCard({ spend, average }: { spend: Metrics["spend"]; average: number | null }) {
  const total = spend.reduce((n, s) => n + s.cost, 0);
  const max = Math.max(...spend.map((s) => s.cost), 0.0001);
  const sorted = [...spend].sort((a, b) => b.cost - a.cost);
  return (
    <Card>
      <CardHeader
        title="Model spend"
        description="NVIDIA Nemotron on Nebius Token Factory, in this workspace"
      />
      <CardBody>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-ink-2 text-xs">Average per case</p>
            {average === null ? (
              <p className="text-ink-3 mt-2 text-[15px]">No analyzed cases yet</p>
            ) : (
              <p className="text-ink mt-1 text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
                {formatCost(average)}
              </p>
            )}
          </div>
          <div>
            <p className="text-ink-2 text-xs">Total</p>
            <p className="text-ink mt-1 text-lg leading-none font-semibold tabular-nums">
              {formatCost(total)}
            </p>
          </div>
        </div>
        {sorted.length === 0 ? (
          <p className="text-ink-2 mt-5 text-sm">
            No model calls yet. Open a case to run its first analysis.
          </p>
        ) : (
          <ul className="mt-5 space-y-3.5">
            {sorted.map((s, i) => (
              <li key={s.model}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-ink flex min-w-0 items-center gap-2">
                    <ModelSwatch tier={modelTier(s.model)} />
                    <span className="truncate">{fullModelName(s.model)}</span>
                  </span>
                  <span className="text-ink-2 shrink-0 tabular-nums">
                    {s.calls} {s.calls === 1 ? "call" : "calls"} ·{" "}
                    <span className="text-ink font-medium">{formatCost(s.cost)}</span>
                  </span>
                </div>
                <Meter
                  value={s.cost}
                  max={max}
                  tone={
                    modelTier(s.model) === "ultra"
                      ? "ink"
                      : modelTier(s.model) === "super"
                        ? "moss"
                        : "lemon"
                  }
                  delay={0.15 + i * 0.06}
                />
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function HealthSkeleton() {
  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <KpiSkeleton />
        <KpiSkeleton />
        <KpiSkeleton />
        <KpiSkeleton />
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[0.85fr_1.4fr]">
        <Skeleton className="rounded-card h-[360px]" />
        <Skeleton className="rounded-card h-[360px]" />
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Skeleton className="rounded-card h-64" />
        <Skeleton className="rounded-card h-64" />
      </div>
    </>
  );
}
