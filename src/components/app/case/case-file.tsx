"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, FileSearch, MessagesSquare, RotateCcw, SearchX, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { CaseResponse } from "@/lib/api-types";
import type { Analysis } from "@/lib/domain";
import { clearAnalysis, startAnalysis, useAnalysisRun } from "@/lib/client/analysis";
import { errorMessage, HttpError } from "@/lib/client/api";
import { openAsk } from "@/lib/client/ask";
import { timeAgo } from "@/lib/client/format";
import { useCase, useSession } from "@/lib/client/hooks";
import { useNow } from "@/lib/client/now";
import { formatUsd } from "@/lib/money";
import { caseProtection } from "@/lib/rules/protection";
import { duration, ease } from "../../motion";
import { Avatar } from "../../ui/avatar";
import { Button, ButtonLink } from "../../ui/button";
import { Card, CardBody, CardHeader } from "../../ui/card";
import { EmptyState } from "../../ui/empty-state";
import { ModelBadge } from "../../ui/model-badge";
import { Skeleton, SkeletonText } from "../../ui/skeleton";
import { DueLabel, OutcomeChip, ReasonChip, StageChip, StatusChip } from "../case-chips";
import { Screen } from "../page-header";
import { EvidenceList, EvidenceProvider } from "./evidence";
import { LiveAnalysis } from "./live-analysis";
import { ModelStrip } from "./model-strip";
import { BuyerPhotos } from "./photos";
import { ProtectionChecklist } from "./protection";
import { RecommendationPanel } from "./recommendation";
import { SimilarCases } from "./similar";
import { buildTimeline, Timeline } from "./timeline";

/**
 * The case file: everything about one dispute on the left, Truce's call on the right. On first
 * open the analysis streams in live, step by step.
 */
export function CaseFile({ id }: { id: string }) {
  const { data, error, mutate } = useCase(id);
  const workspace = useSession().data?.workspace;
  const run = useAnalysisRun(id);
  const [settled, setSettled] = useState<number | null>(null);

  const needsAnalysis = Boolean(data && !data.analysis && data.case.status !== "closed");
  useEffect(() => {
    if (needsAnalysis && !run) startAnalysis(id);
  }, [needsAnalysis, run, id]);

  // Hold the finished live view a moment, so the last check lands before the panel changes.
  useEffect(() => {
    if (run?.status !== "done" || run.endedAt === null) return;
    const ended = run.endedAt;
    const timer = window.setTimeout(() => setSettled(ended), 900);
    return () => window.clearTimeout(timer);
  }, [run?.status, run?.endedAt]);

  if (error && !data) {
    const missing = error instanceof HttpError && error.status === 404;
    return (
      <Screen>
        <BackLink />
        <EmptyState
          tone={missing ? "default" : "error"}
          className="pt-24"
          icon={missing ? <SearchX /> : <RotateCcw />}
          title={missing ? "This case isn't in your shop" : "Couldn't open this case"}
          description={
            missing
              ? "It may belong to another demo copy, or the demo was reset."
              : errorMessage(error)
          }
          action={
            missing ? (
              <ButtonLink href="/app">Back to cases</ButtonLink>
            ) : (
              <Button onClick={() => void mutate()}>Try again</Button>
            )
          }
        />
      </Screen>
    );
  }
  if (!data || !workspace) return <CaseFileSkeleton />;

  const live = run && (run.status !== "done" || settled !== run.endedAt);
  const analysis: Analysis | null = (run?.status === "done" ? run.result : null) ?? data.analysis;
  const records = analysis?.evidence ?? [];
  const protection =
    analysis?.protection ?? (data.order ? caseProtection(data.case.reason, data.order) : null);

  return (
    <EvidenceProvider records={records}>
      <Screen wide>
        <BackLink />
        <CaseHeader data={data} />

        <div className="mt-8 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] xl:gap-6">
          {/* Left: the facts */}
          <div className="min-w-0 space-y-5">
            <Card>
              <CardHeader
                title="What happened"
                actions={
                  analysis && (
                    <ModelBadge
                      model={analysis.steps.find((s) => s.step === "triage")?.model ?? null}
                    />
                  )
                }
              />
              <CardBody className="space-y-3">
                {analysis ? (
                  <p className="text-ink text-[14px] leading-relaxed">{analysis.triage.summary}</p>
                ) : run?.status === "running" ? (
                  <SkeletonText lines={2} />
                ) : null}
                <blockquote className="border-ink/15 bg-cream text-ink rounded-[10px] rounded-tl-[3px] border-l-2 px-3.5 py-2.5 text-[14px] leading-relaxed">
                  &ldquo;{data.case.buyerClaim}&rdquo;
                  <footer className="text-ink-2 mt-1 text-xs">{data.case.buyer.name}</footer>
                </blockquote>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="The story so far" description="From checkout to today" />
              <CardBody>
                <Timeline items={buildTimeline(data.case, data.order, data.events)} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Evidence"
                description={
                  analysis
                    ? `${records.length} records Truce can cite`
                    : "What Truce gathers to answer this case"
                }
              />
              <CardBody>
                {analysis ? (
                  <EvidenceList records={records} />
                ) : (
                  <GatheringPlaceholder running={run?.status === "running"} />
                )}
              </CardBody>
            </Card>

            {protection && (
              <Card>
                <CardHeader
                  title="Seller Protection"
                  description="PayPal's rules, checked in code"
                />
                <CardBody>
                  <ProtectionChecklist result={protection} />
                </CardBody>
              </Card>
            )}

            {data.case.photos.length > 0 && (
              <Card>
                <CardHeader
                  title="The buyer's photos"
                  description="Truce's vision model reads these too"
                />
                <CardBody>
                  <BuyerPhotos photos={data.case.photos} buyer={data.case.buyer.name} />
                </CardBody>
              </Card>
            )}

            {analysis && analysis.similar.length > 0 && (
              <Card>
                <CardHeader
                  title="Like this before"
                  description="Closed cases with a similar story"
                />
                <CardBody>
                  <SimilarCases cases={analysis.similar} />
                </CardBody>
              </Card>
            )}
          </div>

          {/* Right: Truce's call */}
          <div className="min-w-0 space-y-4 max-xl:order-first">
            <AnimatePresence mode="wait" initial={false}>
              {live && run ? (
                <Fade key="live">
                  <LiveAnalysis run={run} onRetry={() => startAnalysis(id, { live: true })} />
                </Fade>
              ) : analysis ? (
                <Fade key={`rec-${analysis.createdAt}`}>
                  <div className="space-y-4">
                    <RecommendationPanel
                      kase={data.case}
                      analysis={analysis}
                      events={data.events}
                      workspace={workspace}
                    />
                    <ModelStrip
                      steps={analysis.steps}
                      totalCost={analysis.totalCost}
                      replayed={run?.status === "done" ? run.replayed : false}
                      running={false}
                      onRunLive={
                        data.case.status === "needs_you"
                          ? () => {
                              clearAnalysis(id);
                              startAnalysis(id, { live: true });
                            }
                          : undefined
                      }
                    />
                  </div>
                </Fade>
              ) : (
                <Fade key="none">
                  <Card>
                    <EmptyState
                      icon={<Sparkles />}
                      title="Truce hasn't analyzed this case"
                      description="It closed before Truce looked at it. You can still run an analysis to see what Truce would have done."
                      action={
                        <Button onClick={() => startAnalysis(id, { live: true })}>
                          Analyze it now
                        </Button>
                      }
                    />
                  </Card>
                </Fade>
              )}
            </AnimatePresence>
          </div>
        </div>
      </Screen>
    </EvidenceProvider>
  );
}

function Fade({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.out } }}
      exit={{ opacity: 0, y: -4, transition: { duration: duration.fast, ease: ease.in } }}
    >
      {children}
    </motion.div>
  );
}

function BackLink() {
  return (
    <Link
      href="/app"
      className="text-ink-2 hover:text-ink -ml-1 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-[13px] font-medium transition-colors"
    >
      <ArrowLeft className="size-4" />
      Cases
    </Link>
  );
}

function CaseHeader({ data }: { data: CaseResponse }) {
  const kase = data.case;
  const now = useNow();
  return (
    <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 gap-4">
        <Avatar name={kase.buyer.name} size="lg" />
        <div className="min-w-0">
          <h1 className="text-ink text-[24px] leading-tight font-semibold tracking-[-0.02em]">
            {kase.buyer.name}
          </h1>
          <p className="text-ink-2 mt-0.5 truncate text-sm">
            {kase.itemSummary}
            {data.order && (
              <>
                {" · "}
                <Link
                  href={`/app/orders?order=${encodeURIComponent(data.order.id)}`}
                  className="text-moss hover:underline"
                >
                  Order {data.order.id}
                </Link>
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="flex flex-wrap items-center gap-1.5">
              <ReasonChip reason={kase.reason} />
              <StageChip stage={kase.stage} />
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={kase.status}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: duration.base, ease: ease.out }}
                  className="inline-flex"
                >
                  <StatusChip status={kase.status} />
                </motion.span>
              </AnimatePresence>
              {kase.outcome && <OutcomeChip outcome={kase.outcome} />}
            </span>
            {kase.status !== "closed" && <DueLabel dueAt={kase.dueAt} />}
            <span className="text-ink-3 text-[13px]">
              {kase.paypalDisputeId} · opened {timeAgo(kase.openedAt, now).toLowerCase()}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4 lg:flex-col lg:items-end lg:gap-3">
        <div className="lg:text-right">
          <p className="text-ink text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
            {formatUsd(kase.amount)}
          </p>
          {kase.status === "closed" && (kase.moneyKept > 0 || kase.feeCharged > 0) && (
            <p className="text-ink-2 mt-1.5 text-[13px] tabular-nums">
              Kept {formatUsd(kase.moneyKept)}
              {kase.feeCharged > 0 && (
                <span className="text-risk-700"> · {formatUsd(kase.feeCharged)} fee</span>
              )}
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<MessagesSquare />}
          onClick={() => openAsk("")}
          className="max-lg:ml-auto"
        >
          Ask about this case
        </Button>
      </div>
    </div>
  );
}

function GatheringPlaceholder({ running }: { running: boolean }) {
  return (
    <div className="space-y-2" aria-busy={running}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="border-line-soft flex gap-3 rounded-[10px] border p-3">
          <Skeleton className="h-[22px] w-[30px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        </div>
      ))}
      <p className="text-ink-2 flex items-center gap-2 pt-1 text-xs">
        <FileSearch className="size-3.5" />
        {running
          ? "Gathering the payment, tracking, listing, policies and messages"
          : "Evidence appears once Truce analyzes the case"}
      </p>
    </div>
  );
}

function CaseFileSkeleton() {
  return (
    <Screen wide>
      <Skeleton className="h-5 w-20" />
      <div className="mt-5 flex gap-4">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex-1 space-y-2.5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-6 w-80" />
        </div>
      </div>
      <div className="mt-8 grid gap-5 xl:grid-cols-[1fr_1.08fr]">
        <div className="space-y-5">
          <Skeleton className="rounded-card h-40" />
          <Skeleton className="rounded-card h-96" />
        </div>
        <div className="space-y-4 max-xl:order-first">
          <Skeleton className="rounded-card h-[420px]" />
        </div>
      </div>
    </Screen>
  );
}
