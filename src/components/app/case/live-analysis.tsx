"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CircleAlert, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AnalysisRun, StepRun } from "@/lib/client/analysis";
import { formatCost, formatMs } from "@/lib/client/format";
import { STEPS } from "@/lib/client/labels";
import { duration, ease, spring } from "../../motion";
import { Button } from "../../ui/button";
import { ProgressRing } from "../../ui/charts";
import { cn } from "../../ui/cn";
import { ThinkingMark } from "../../ui/logo";
import { ModelBadge } from "../../ui/model-badge";
import { Spinner } from "../../ui/spinner";

/** Seconds since `from`, ticking while `running`. */
function useElapsed(from: number, to: number | null, running: boolean): number {
  const [now, setNow] = useState(from);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [running]);
  return Math.max(0, ((to ?? now) - from) / 1000);
}

/**
 * The analysis as it happens: each step lights up in turn, tools pop in as Truce uses them, and
 * the draft writes itself in. Replays of recorded runs play at the pace they first ran.
 */
export function LiveAnalysis({ run, onRetry }: { run: AnalysisRun; onRetry: () => void }) {
  const running = run.status === "running";
  const elapsed = useElapsed(run.startedAt, run.endedAt, running);
  const hints = Object.fromEntries(STEPS.map((s) => [s.id, s.hint]));
  const draftText = run.text.draft ?? "";
  const done = run.steps.filter((s) => s.state === "done").length;
  const fixedText = run.text.verify ?? "";

  return (
    <div className="rounded-card border-line bg-paper overflow-hidden border">
      <div className="border-line-soft flex items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-3">
          {running ? (
            <ThinkingMark className="size-9" />
          ) : run.status === "error" ? (
            <span className="bg-risk-50 text-risk-700 flex size-9 items-center justify-center rounded-[10px]">
              <CircleAlert className="size-4" />
            </span>
          ) : (
            <span className="bg-lemon text-ink flex size-9 items-center justify-center rounded-[10px]">
              <Check className="size-4" strokeWidth={2.5} />
            </span>
          )}
          <div>
            <h2 className="text-ink text-[15px] font-semibold">
              {running
                ? "Truce is working on this case"
                : run.status === "error"
                  ? "The analysis stopped"
                  : "Analysis ready"}
            </h2>
            <p className="text-ink-2 flex items-center gap-1.5 text-[13px] tabular-nums">
              <ProgressRing
                value={done / run.steps.length}
                size={14}
                stroke={2}
                className="text-moss"
              />
              {done} of {run.steps.length} steps · {elapsed.toFixed(1)} s · {formatCost(run.cost)}
            </p>
          </div>
        </div>
        {run.status === "error" && (
          <Button size="sm" variant="secondary" icon={<RotateCcw />} onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>

      <ol className="px-3 py-3">
        {run.steps.map((step, index) => (
          <StepRow
            key={step.id}
            step={step}
            hint={hints[step.id] ?? ""}
            index={index}
            draftText={step.id === "draft" ? draftText : step.id === "verify" ? fixedText : ""}
          />
        ))}
      </ol>

      {run.status === "error" && run.error && (
        <p
          role="alert"
          className="bg-risk-50 text-risk-700 mx-5 mb-5 rounded-[10px] px-3.5 py-3 text-[13px]"
        >
          {run.error}
        </p>
      )}
    </div>
  );
}

function StepRow({
  step,
  hint,
  index,
  draftText,
}: {
  step: StepRun;
  hint: string;
  index: number;
  draftText: string;
}) {
  const cost = step.usage.reduce((sum, u) => sum + (u.cost ?? 0), 0);
  const ms = step.startedAt && step.endedAt ? step.endedAt - step.startedAt : 0;
  const active = step.state === "active";
  const done = step.state === "done";

  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: step.state === "pending" ? 0.5 : 1, y: 0 }}
      transition={{ duration: duration.base, ease: ease.out, delay: index * 0.03 }}
      className={cn(
        "relative rounded-[10px] px-2.5 py-2.5 transition-colors duration-300",
        active && "shimmer shimmer-lemon bg-mist/70",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="relative mt-px flex size-[22px] shrink-0 items-center justify-center">
          <AnimatePresence mode="popLayout" initial={false}>
            {done ? (
              <motion.span
                key="done"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={spring.pop}
                className="bg-lemon flex size-[22px] items-center justify-center rounded-full"
              >
                <Check className="text-ink size-3" strokeWidth={3} />
              </motion.span>
            ) : active ? (
              <motion.span
                key="active"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-ink text-lemon flex size-[22px] items-center justify-center rounded-full"
              >
                <Spinner className="size-3" />
              </motion.span>
            ) : step.state === "error" ? (
              <motion.span
                key="error"
                initial={{ scale: 0.4 }}
                animate={{ scale: 1 }}
                className="bg-risk-50 text-risk-700 flex size-[22px] items-center justify-center rounded-full"
              >
                <CircleAlert className="size-3" />
              </motion.span>
            ) : (
              <motion.span
                key="pending"
                className="border-ink-3 size-[9px] rounded-full border-[1.5px]"
              />
            )}
          </AnimatePresence>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p
              className={cn(
                "text-[13.5px] font-medium",
                step.state === "error" ? "text-risk-700" : "text-ink",
              )}
            >
              {step.label}
            </p>
            {(step.model || (step.id === "protect" && (done || active))) && (
              <span className="text-ink-2 flex items-center gap-2.5 text-xs tabular-nums">
                <ModelBadge model={step.model ?? null} />
                {done && cost > 0 && <span>{formatCost(cost)}</span>}
                {done && ms > 0 && <span className="text-ink-3">{formatMs(ms)}</span>}
              </span>
            )}
          </div>
          {(active || step.state === "pending") && (
            <p className="text-ink-2 mt-0.5 text-xs">{hint}</p>
          )}

          {step.tools.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <AnimatePresence initial={false}>
                {step.tools.map((tool) => (
                  <motion.span
                    key={tool.id}
                    initial={{ opacity: 0, scale: 0.8, y: 3 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={spring.pop}
                    className={cn(
                      "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium",
                      tool.state === "start" && "border-line bg-paper text-ink-2",
                      tool.state === "done" && "bg-ink/[0.05] text-ink-2 border-transparent",
                      tool.state === "error" && "border-risk-200 bg-risk-50 text-risk-700",
                    )}
                  >
                    {tool.state === "start" ? (
                      <Spinner className="size-2.5" />
                    ) : tool.state === "done" ? (
                      <Check className="text-moss size-2.5" strokeWidth={3} />
                    ) : (
                      <CircleAlert className="size-2.5" />
                    )}
                    {tool.label}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
          )}

          {draftText && <StreamingText text={draftText} streaming={active} />}
        </div>
      </div>
    </motion.li>
  );
}

function StreamingText({ text, streaming }: { text: string; streaming: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);
  return (
    <motion.div
      ref={box}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base, ease: ease.out }}
      className="border-line-soft bg-paper text-ink mt-2.5 max-h-48 overflow-y-auto rounded-[10px] border px-3.5 py-3 text-[13.5px] leading-relaxed whitespace-pre-wrap"
    >
      {text}
      {streaming && (
        <span
          aria-hidden
          className="bg-ink/70 ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] animate-pulse"
        />
      )}
    </motion.div>
  );
}
