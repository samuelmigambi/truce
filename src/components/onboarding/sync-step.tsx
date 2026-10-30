"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CircleAlert, Minus } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { shopHref } from "@/lib/client/api";
import { REASON, STATUS } from "@/lib/client/labels";
import type { CaseStatus, Shop } from "@/lib/domain";
import { formatMoney } from "@/lib/money";
import { duration, ease, spring } from "../motion";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { ProgressRing } from "../ui/charts";
import { Chip, type Tone } from "../ui/chip";
import { cn } from "../ui/cn";
import { ThinkingMark } from "../ui/logo";
import { AnimatedNumber } from "../ui/money";
import { Spinner } from "../ui/spinner";
import { useToast } from "../ui/toast";
import { StepFooter, type StepBase } from "./step-frame";
import type { FirstAnalysis, FoundCase, SyncRun, SyncStepRun } from "./sync-run";

const STATUS_TONE: Record<CaseStatus, Tone> = {
  needs_you: "lemon",
  waiting_buyer: "outline",
  with_paypal: "neutral",
  closed: "neutral",
};

/** Disputes shown as they arrive; the rest are counted. */
const SHOWN_CASES = 6;

/** Seconds since the sync started, ticking while it runs. */
function useElapsed(run: SyncRun): number {
  const running = run.status === "running";
  const [now, setNow] = useState(run.startedAt);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [running]);
  return Math.max(0, ((run.endedAt ?? Math.max(now, run.startedAt)) - run.startedAt) / 1000);
}

/**
 * Step 7: the first sync, live. Each step lights up in turn, disputes pop in as Truce finds
 * them, and the first analysis runs inside the last step, model by model. When it's done, the
 * shop is ready and the dashboard is one click away.
 */
export function SyncStep({
  shop,
  run,
  onRetry,
  ...base
}: StepBase & {
  shop: Shop;
  run: SyncRun;
  onRetry: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const elapsed = useElapsed(run);
  const done = run.steps.filter((step) => step.state === "done" || step.state === "skipped").length;
  const status = run.status;
  const current = run.steps.find((step) => step.state === "active");
  const toast = useToast();

  // Focus starts on the title; it moves again when the sync stops, and Ready takes it when done.
  useEffect(() => {
    if (!base.focusOnMount) return;
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [base.focusOnMount]);
  useEffect(() => {
    if (status !== "error") return;
    heading.current?.focus({ preventScroll: true });
    toast({
      key: "onboarding",
      tone: "error",
      title: run.error ?? "Something went wrong on our side.",
      description: "Nothing in your PayPal account was changed.",
    });
  }, [status, run.error, toast]);

  return (
    <section
      aria-labelledby="sync-title"
      className="rounded-panel border-line bg-paper overflow-hidden border shadow-[0_1px_2px_rgb(30_38_20/0.04)]"
    >
      <AnimatePresence mode="wait" initial={false}>
        {status === "done" && run.result ? (
          <motion.div
            key="ready"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.slow, ease: ease.out }}
          >
            <Ready
              shop={run.result.shop}
              cases={run.result.cases}
              orders={run.result.orders}
              analyzed={run.cases.find((c) => c.caseId === run.result?.analyzedCaseId) ?? null}
              analyzedCaseId={run.result.analyzedCaseId}
            />
          </motion.div>
        ) : (
          <motion.header
            key="working"
            exit={{ opacity: 0, transition: { duration: duration.fast, ease: ease.in } }}
            className="border-line-soft flex items-center gap-3.5 border-b px-5 py-5 sm:px-8"
          >
            {status === "error" ? (
              <span className="bg-risk-50 text-risk-700 flex size-11 shrink-0 items-center justify-center rounded-[12px]">
                <CircleAlert aria-hidden className="size-5" />
              </span>
            ) : (
              <ThinkingMark className="size-11" />
            )}
            <div className="min-w-0">
              <h1
                id="sync-title"
                ref={heading}
                tabIndex={-1}
                data-step-heading
                className="text-ink text-[20px] leading-tight font-semibold tracking-[-0.02em] focus:outline-none sm:text-[22px]"
              >
                {status === "error" ? "The sync stopped" : `Syncing ${shop.name}`}
              </h1>
              <p className="text-ink-2 mt-1 flex items-center gap-1.5 text-[13px] tabular-nums">
                <ProgressRing
                  value={done / run.steps.length}
                  size={14}
                  stroke={2}
                  className="text-moss"
                />
                {done} of {run.steps.length} steps · {elapsed.toFixed(1)} s
              </p>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      <p className="sr-only" role="status">
        {status === "running" && current ? `${current.label}…` : ""}
      </p>

      <ol className="px-3 py-3 sm:px-5">
        {run.steps.map((step, index) => (
          <SyncStepRow key={step.id} step={step} index={index}>
            {step.id === "disputes" && (
              <FoundCases
                cases={run.cases}
                currency={shop.currency}
                active={step.state === "active"}
              />
            )}
            {step.id === "analysis" && run.analysis && (
              <AnalysisInside
                analysis={run.analysis}
                found={run.cases.find((c) => c.caseId === run.analysis?.caseId) ?? null}
              />
            )}
          </SyncStepRow>
        ))}
      </ol>

      {status !== "done" && (
        <div className="border-line-soft bg-cream/60 border-t px-5 py-4 sm:px-8">
          <StepFooter
            onBack={status === "error" ? base.onBack : undefined}
            note={status === "running" ? "Keep this page open until it's done" : undefined}
          >
            {status === "error" ? (
              <Button onClick={onRetry}>Try again</Button>
            ) : (
              <span className="text-ink-2 inline-flex items-center gap-2 text-[13px] sm:hidden">
                <Spinner className="size-3.5" />
                Working
              </span>
            )}
          </StepFooter>
        </div>
      )}
    </section>
  );
}

function StepMarker({ state }: { state: SyncStepRun["state"] }) {
  return (
    <span className="relative mt-px flex size-[22px] shrink-0 items-center justify-center">
      <AnimatePresence mode="popLayout" initial={false}>
        {state === "done" ? (
          <motion.span
            key="done"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={spring.pop}
            className="bg-lemon flex size-[22px] items-center justify-center rounded-full"
          >
            <Check aria-hidden className="text-ink size-3" strokeWidth={3} />
          </motion.span>
        ) : state === "active" ? (
          <motion.span
            key="active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-ink text-lemon flex size-[22px] items-center justify-center rounded-full"
          >
            <Spinner className="size-3" />
          </motion.span>
        ) : state === "error" ? (
          <motion.span
            key="error"
            initial={{ scale: 0.4 }}
            animate={{ scale: 1 }}
            className="bg-risk-50 text-risk-700 flex size-[22px] items-center justify-center rounded-full"
          >
            <CircleAlert aria-hidden className="size-3" />
          </motion.span>
        ) : state === "skipped" ? (
          <motion.span
            key="skipped"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-ink/[0.06] text-ink-3 flex size-[22px] items-center justify-center rounded-full"
          >
            <Minus aria-hidden className="size-3" strokeWidth={2.5} />
          </motion.span>
        ) : (
          <motion.span
            key="pending"
            className="border-ink-3 size-[9px] rounded-full border-[1.5px]"
          />
        )}
      </AnimatePresence>
    </span>
  );
}

const STATE_WORD: Record<SyncStepRun["state"], string> = {
  pending: "Not started",
  active: "In progress",
  done: "Done",
  error: "Stopped",
  skipped: "Skipped",
};

function SyncStepRow({
  step,
  index,
  children,
}: {
  step: SyncStepRun;
  index: number;
  children?: ReactNode;
}) {
  const active = step.state === "active";
  const progress = step.progress && step.progress.total > 0 ? step.progress : null;
  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: step.state === "pending" ? 0.55 : 1, y: 0 }}
      transition={{ duration: duration.base, ease: ease.out, delay: index * 0.03 }}
      className={cn(
        "relative rounded-[10px] px-2.5 py-2.5 transition-colors duration-300",
        active && "shimmer shimmer-lemon bg-mist/70",
      )}
    >
      <div className="flex items-start gap-3">
        <StepMarker state={step.state} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p
              className={cn(
                "text-[13.5px] font-medium",
                step.state === "error" ? "text-risk-700" : "text-ink",
                step.state === "skipped" && "text-ink-2",
              )}
            >
              {step.label}
              <span className="sr-only">: {STATE_WORD[step.state]}</span>
            </p>
            {progress && (
              <span className="text-ink-2 text-xs tabular-nums">
                {progress.done} of {progress.total}
              </span>
            )}
          </div>
          {step.detail && (
            <p
              className={cn(
                "mt-0.5 text-xs leading-[1.45]",
                step.state === "error" ? "text-risk-700" : "text-ink-2",
              )}
            >
              {step.detail}
            </p>
          )}
          {progress && active && (
            <div aria-hidden className="bg-ink/[0.07] mt-2 h-1 overflow-hidden rounded-full">
              <motion.div
                className="bg-moss h-full origin-left rounded-full"
                initial={false}
                animate={{ scaleX: Math.min(1, progress.done / progress.total) }}
                transition={{ duration: duration.slow, ease: ease.out }}
              />
            </div>
          )}
          {children}
        </div>
      </div>
    </motion.li>
  );
}

function StatusChip({ status, className }: { status: CaseStatus; className?: string }) {
  return (
    <Chip size="sm" tone={STATUS_TONE[status]} dot={status !== "closed"} className={className}>
      {STATUS[status]}
    </Chip>
  );
}

function FoundCases({
  cases,
  currency,
  active,
}: {
  cases: FoundCase[];
  currency: string;
  active: boolean;
}) {
  const shown = cases.slice(0, SHOWN_CASES);
  const more = cases.length - shown.length;
  if (cases.length === 0) {
    return active ? null : <p className="text-ink-2 mt-1 text-xs">No open disputes right now.</p>;
  }
  return (
    <div className="mt-2.5">
      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {shown.map((found) => (
            <motion.li
              key={found.caseId}
              layout
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={spring.pop}
              className="border-line-soft bg-paper flex items-center gap-2.5 rounded-[10px] border px-3 py-2"
            >
              <Avatar name={found.buyer} size="sm" />
              {/* Phones: name and amount on top, the item and status under them. */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-ink truncate text-[13px] font-medium">{found.buyer}</p>
                  <span className="text-ink text-[13px] font-semibold tabular-nums sm:hidden">
                    {formatMoney(found.amount, currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-ink-2 truncate text-xs">{found.itemSummary}</p>
                  <StatusChip status={found.status} className="sm:hidden" />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 max-sm:hidden">
                <Chip size="sm">{REASON[found.reason]}</Chip>
                <StatusChip status={found.status} />
                <span className="text-ink min-w-14 text-right text-[13px] font-semibold tabular-nums">
                  {formatMoney(found.amount, currency)}
                </span>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {more > 0 && (
        <p className="text-ink-2 mt-1.5 pl-1 text-xs">
          And {more} more {more === 1 ? "dispute" : "disputes"}
        </p>
      )}
    </div>
  );
}

function AnalysisInside({ analysis, found }: { analysis: FirstAnalysis; found: FoundCase | null }) {
  const drafting = analysis.steps.some((step) => step.id === "draft" && step.state === "active");
  const toast = useToast();
  useEffect(() => {
    if (analysis.error) toast({ key: "analysis", tone: "error", title: analysis.error });
  }, [analysis.error, toast]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base, ease: ease.out }}
      className="border-line-soft bg-paper mt-2.5 rounded-[12px] border p-3"
    >
      {found && (
        <p className="text-ink-2 mb-2 text-xs">
          <span className="text-ink font-medium">{found.buyer}</span>
          {" · "}
          {REASON[found.reason]}
        </p>
      )}
      <ol className="space-y-1.5">
        {analysis.steps.map((step) => (
          <li key={step.id} className="flex min-w-0 items-start gap-2 text-xs leading-4">
            <span
              aria-hidden
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full transition-colors duration-200",
                "mt-px",
                step.state === "done" && "bg-lemon text-ink",
                step.state === "active" && "bg-ink text-lemon",
                step.state === "error" && "bg-risk-50 text-risk-700",
                step.state === "pending" && "border-ink-3/70 border",
              )}
            >
              {step.state === "done" && <Check className="size-2.5" strokeWidth={3} />}
              {step.state === "active" && <Spinner className="size-2.5" />}
              {step.state === "error" && <CircleAlert className="size-2.5" />}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 pt-px",
                step.state === "pending" ? "text-ink-3" : "text-ink",
                step.state === "error" && "text-risk-700",
              )}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>
      {analysis.draft && (
        <div className="border-line-soft bg-cream/70 text-ink mt-3 rounded-[10px] border px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap">
          {analysis.draft}
          {drafting && (
            <span
              aria-hidden
              className="bg-ink/70 ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] animate-pulse"
            />
          )}
        </div>
      )}
    </motion.div>
  );
}

const plain = new Intl.NumberFormat("en-US");

function Ready({
  shop,
  cases,
  orders,
  analyzed,
  analyzedCaseId,
}: {
  shop: Shop;
  cases: number;
  orders: number;
  analyzed: FoundCase | null;
  analyzedCaseId: string | null;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "smooth" });
    heading.current?.focus({ preventScroll: true });
  }, []);
  const ordersLabel = shop.orderHistory === "disputes" ? "Orders with a dispute" : "Orders";
  const summary =
    cases === 0
      ? "No disputes right now. Truce keeps watching PayPal and tells you when one arrives."
      : analyzedCaseId
        ? "Truce has sorted every case by its deadline and analyzed the most urgent one. It's waiting for your approval."
        : "Truce has sorted every case by its deadline. Open one to see what it recommends.";

  return (
    <div className="px-5 pt-8 pb-7 sm:px-8 sm:pt-10">
      <motion.span
        aria-hidden
        initial={{ scale: 0.3, opacity: 0, rotate: -20 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ ...spring.pop, delay: 0.05 }}
        className="bg-lemon text-ink flex size-14 items-center justify-center rounded-full"
      >
        <Check className="size-7" strokeWidth={2.5} />
      </motion.span>
      <h1
        id="sync-title"
        ref={heading}
        tabIndex={-1}
        data-step-heading
        className="text-ink mt-6 text-[26px] leading-tight font-semibold tracking-[-0.02em] focus:outline-none sm:text-[30px]"
      >
        Your shop is ready
      </h1>
      <p className="text-ink-2 mt-2 max-w-[520px] text-[15px] leading-relaxed text-pretty">
        {summary}
      </p>

      <dl className="mt-7 grid max-w-[420px] grid-cols-2 gap-3">
        <div className="rounded-card border-line border px-4 py-3.5">
          <dt className="text-ink-2 text-[13px]">Disputes</dt>
          <dd className="text-ink mt-1 text-[28px] leading-none font-semibold tracking-[-0.02em]">
            <AnimatedNumber value={cases} format={(v) => plain.format(Math.round(v))} delay={0.2} />
          </dd>
        </div>
        <div className="rounded-card border-line border px-4 py-3.5">
          <dt className="text-ink-2 text-[13px]">{ordersLabel}</dt>
          <dd className="text-ink mt-1 text-[28px] leading-none font-semibold tracking-[-0.02em]">
            <AnimatedNumber
              value={orders}
              format={(v) => plain.format(Math.round(v))}
              delay={0.3}
            />
          </dd>
        </div>
      </dl>
      {shop.orderHistory === "disputes" && (
        <p className="text-ink-2 mt-3 max-w-[520px] text-[13px] leading-5">
          Transaction search is off for this PayPal app, so Truce sees only orders with a dispute
          and can&rsquo;t work out your claims ratio yet.
        </p>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={() => window.location.assign(shopHref(shop.id))}>
          Open your dashboard
        </Button>
        {analyzedCaseId && (
          <Button
            size="lg"
            variant="secondary"
            onClick={() =>
              window.location.assign(
                shopHref(shop.id, `cases/${encodeURIComponent(analyzedCaseId)}`),
              )
            }
          >
            {analyzed ? `Open ${analyzed.buyer}'s case` : "Open the analyzed case"}
          </Button>
        )}
      </div>
    </div>
  );
}
