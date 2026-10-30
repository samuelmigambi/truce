"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, RotateCcw, SearchX, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { CaseResponse } from "@/lib/api-types";
import type { Analysis } from "@/lib/domain";
import { clearAnalysis, startAnalysis, useAnalysisRun, waitingRun } from "@/lib/client/analysis";
import { errorMessage, HttpError, shopHref } from "@/lib/client/api";
import { openAsk } from "@/lib/client/ask";
import { useCase } from "@/lib/client/hooks";
import { REASON, STAGE } from "@/lib/client/labels";
import { useMoney, useShop } from "@/lib/client/shop-context";
import { caseProtection } from "@/lib/rules/protection";
import { duration, ease } from "../../motion";
import { Avatar } from "../../ui/avatar";
import { Button, ButtonLink } from "../../ui/button";
import { Card, CardBody, CardHeader } from "../../ui/card";
import { Chip, CountBadge } from "../../ui/chip";
import { EmptyState } from "../../ui/empty-state";
import { Skeleton, SkeletonText } from "../../ui/skeleton";
import { DueLabel, OutcomeChip, StatusChip } from "../case-chips";
import { Screen } from "../page-header";
import { EvidenceList, EvidenceProvider } from "./evidence";
import { LiveAnalysis } from "./live-analysis";
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
  const shop = useShop();
  const { data, error, mutate } = useCase(id);
  const run = useAnalysisRun(shop.id, id);
  const [settled, setSettled] = useState<number | null>(null);

  const needsAnalysis = Boolean(data && !data.analysis && data.case.status !== "closed");
  useEffect(() => {
    if (needsAnalysis && !run) startAnalysis(shop.id, id);
  }, [needsAnalysis, run, id, shop.id]);

  // Hold the finished live view a moment, so the last check lands before the panel changes.
  useEffect(() => {
    if (run?.status !== "done" || run.endedAt === null) return;
    const ended = run.endedAt;
    const timer = window.setTimeout(() => setSettled(ended), 900);
    return () => window.clearTimeout(timer);
  }, [run?.status, run?.endedAt]);

  if (error && !data) {
    const missing = error instanceof HttpError && error.status === 404;
    return missing ? (
      <CaseNotFound />
    ) : (
      <Screen>
        <BackLink />
        <EmptyState
          tone="error"
          className="pt-24"
          icon={<RotateCcw />}
          title="Couldn't open this case"
          description={errorMessage(error)}
          action={<Button onClick={() => void mutate()}>Try again</Button>}
        />
      </Screen>
    );
  }
  if (!data) return <CaseFileSkeleton />;

  const live = run && (run.status !== "done" || settled !== run.endedAt);
  const analysis: Analysis | null = (run?.status === "done" ? run.result : null) ?? data.analysis;
  const records = analysis?.evidence ?? [];
  const protection =
    analysis?.protection ?? (data.order ? caseProtection(data.case.reason, data.order) : null);
  const again = () => {
    clearAnalysis(shop.id, id);
    startAnalysis(shop.id, id, { live: true });
  };

  return (
    <EvidenceProvider records={records}>
      <Screen wide>
        <BackLink />
        <CaseHeader data={data} />

        <div className="mt-6 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] xl:gap-6">
          {/* Left: the facts */}
          <div className="min-w-0 space-y-5">
            <Card>
              <CardHeader title="What happened" />
              <CardBody className="space-y-4">
                {analysis ? (
                  <p className="text-ink text-[15px] leading-relaxed">{analysis.triage.summary}</p>
                ) : run?.status === "running" ? (
                  <SkeletonText lines={2} />
                ) : null}
                <BuyerClaim name={data.case.buyer.name} text={data.case.buyerClaim} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="The story so far" />
              <CardBody>
                <Timeline items={buildTimeline(data.case, data.order, data.events, shop)} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    Evidence
                    {analysis && records.length > 0 && <CountBadge value={records.length} />}
                  </span>
                }
              />
              <CardBody>
                {analysis ? (
                  <EvidenceList records={records} />
                ) : run?.status === "running" ? (
                  <GatheringPlaceholder />
                ) : (
                  <p className="text-ink-2 text-[14px]">
                    The records appear here once Truce analyzes the case.
                  </p>
                )}
              </CardBody>
            </Card>

            {protection && (
              <Card>
                <CardHeader
                  title="Seller Protection"
                  actions={
                    protection.covered ? (
                      <Chip tone="lemon">Covered</Chip>
                    ) : (
                      <Chip tone="neutral">Not covered</Chip>
                    )
                  }
                />
                <CardBody>
                  <ProtectionChecklist result={protection} />
                </CardBody>
              </Card>
            )}

            {data.case.photos.length > 0 && (
              <Card>
                <CardHeader title="The buyer's photos" />
                <CardBody>
                  <BuyerPhotos photos={data.case.photos} buyer={data.case.buyer.name} />
                </CardBody>
              </Card>
            )}

            {analysis && analysis.similar.length > 0 && (
              <Card>
                <CardHeader title="Like this before" />
                <CardBody>
                  <SimilarCases cases={analysis.similar} />
                </CardBody>
              </Card>
            )}
          </div>

          {/* Right: Truce's call */}
          <div className="min-w-0 max-xl:order-first">
            <AnimatePresence mode="wait" initial={false}>
              {live && run ? (
                <Fade key="live">
                  <LiveAnalysis
                    run={run}
                    onRetry={() => startAnalysis(shop.id, id, { live: true })}
                  />
                </Fade>
              ) : analysis ? (
                <Fade key={`rec-${analysis.createdAt}`}>
                  <RecommendationPanel
                    kase={data.case}
                    analysis={analysis}
                    events={data.events}
                    onRunAgain={data.case.status === "needs_you" ? again : undefined}
                  />
                </Fade>
              ) : needsAnalysis ? (
                // The analysis starts as the page opens; until it does, its steps wait in place.
                <Fade key="live">
                  <LiveAnalysis run={waitingRun(id)} onRetry={() => startAnalysis(shop.id, id)} />
                </Fade>
              ) : (
                <Fade key="none">
                  <Card>
                    <EmptyState
                      icon={<Sparkles />}
                      title="Truce hasn't analyzed this case"
                      description="It closed before Truce looked at it. You can still run an analysis to see what Truce would have done."
                      action={
                        <Button onClick={() => startAnalysis(shop.id, id, { live: true })}>
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

/** A case this shop doesn't have: a mistyped link, or one from another shop. */
export function CaseNotFound() {
  const shop = useShop();
  return (
    <Screen>
      <BackLink />
      <EmptyState
        className="pt-24"
        icon={<SearchX />}
        title="This case isn't in this shop"
        description={`It may belong to another of your shops, or the link is mistyped. Every case in ${shop.name} is in the inbox.`}
        action={<ButtonLink href={shopHref(shop.id, "cases")}>Back to cases</ButtonLink>}
      />
    </Screen>
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
  const shop = useShop();
  return (
    <Link
      href={shopHref(shop.id, "cases")}
      className="text-ink-2 hover:text-ink -ml-1 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-[13px] font-medium transition-colors"
    >
      <ArrowLeft className="size-4" />
      Cases
    </Link>
  );
}

/** Who opened the case and over what, where it stands, and a way to ask about it. */
function CaseHeader({ data }: { data: CaseResponse }) {
  const kase = data.case;
  const shop = useShop();
  return (
    <div className="mt-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={kase.buyer.name} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="text-ink text-[24px] leading-tight font-semibold tracking-[-0.02em]">
                {kase.buyer.name}
              </h1>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={kase.outcome ?? kase.status}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: duration.base, ease: ease.out }}
                  className="inline-flex"
                >
                  {kase.outcome ? (
                    <OutcomeChip outcome={kase.outcome} />
                  ) : (
                    <StatusChip status={kase.status} />
                  )}
                </motion.span>
              </AnimatePresence>
            </div>
            <p className="text-ink-2 mt-1 truncate text-[15px]">{kase.itemSummary}</p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => openAsk(shop.id, "")}
          className="self-start sm:self-auto"
        >
          Ask about this case
        </Button>
      </div>
      <CaseFacts data={data} />
    </div>
  );
}

/** The case at a glance, one fact to a cell: the money, the deadline, the dispute, the order. */
function CaseFacts({ data }: { data: CaseResponse }) {
  const kase = data.case;
  const shop = useShop();
  const money = useMoney();
  const facts: { label: string; value: ReactNode; title?: string }[] = [
    { label: "Amount", value: money(kase.amount) },
    kase.status === "closed"
      ? {
          label: "Kept",
          value: (
            <>
              {money(kase.moneyKept)}
              {kase.feeCharged > 0 && (
                <span className="text-risk-700"> · {money(kase.feeCharged)} fee</span>
              )}
            </>
          ),
        }
      : { label: "Deadline", value: <DueLabel dueAt={kase.dueAt} size="md" /> },
    { label: "Reason", value: REASON[kase.reason] },
    { label: "Stage", value: STAGE[kase.stage] },
  ];
  if (data.order) {
    facts.push({
      label: "Order",
      value: (
        <Link
          href={shopHref(shop.id, `orders?order=${encodeURIComponent(data.order.id)}`)}
          className="text-moss hover:text-moss-deep underline-offset-4 hover:underline"
        >
          {data.order.id}
        </Link>
      ),
    });
  }
  facts.push({ label: "PayPal case", value: kase.paypalDisputeId, title: kase.paypalDisputeId });

  return (
    <dl className="rounded-card border-line bg-paper xl:divide-line-soft mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border px-5 py-4 sm:grid-cols-3 xl:flex xl:gap-0 xl:divide-x xl:px-0">
      {facts.map((fact) => (
        <div key={fact.label} className="min-w-0 xl:flex-1 xl:px-5">
          <dt className="text-ink-2 text-[13px]">{fact.label}</dt>
          <dd
            className="text-ink mt-1 truncate text-[15px] font-medium tabular-nums"
            title={fact.title}
          >
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The buyer's own words, as a message from them. */
function BuyerClaim({ name, text }: { name: string; text: string }) {
  return (
    <figure className="flex gap-3">
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <figcaption className="text-ink text-[13px] font-medium">{name}</figcaption>
        <blockquote className="bg-cream text-ink mt-1.5 rounded-[12px] rounded-tl-[4px] px-3.5 py-2.5 text-[14px] leading-relaxed">
          {text}
        </blockquote>
      </div>
    </figure>
  );
}

function GatheringPlaceholder() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Gathering the records">
      {[0, 1, 2].map((i) => (
        <div key={i} className="border-line-soft flex gap-3 rounded-[10px] border p-3">
          <Skeleton className="h-[22px] w-[30px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CaseFileSkeleton() {
  return (
    <Screen wide>
      <div aria-busy="true" aria-label="Loading the case">
        <Skeleton className="h-5 w-20" />
        <div className="mt-5 flex items-center gap-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2.5">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
        </div>
        <Skeleton className="rounded-card mt-6 h-[74px]" />
        <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_1.08fr]">
          <div className="space-y-5">
            <Skeleton className="rounded-card h-40" />
            <Skeleton className="rounded-card h-96" />
          </div>
          <div className="space-y-4 max-xl:order-first">
            <Skeleton className="rounded-card h-[420px]" />
          </div>
        </div>
      </div>
    </Screen>
  );
}
