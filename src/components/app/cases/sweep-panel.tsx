"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CircleAlert, Inbox, Moon, ShieldAlert, X } from "lucide-react";
import Link from "next/link";
import { formatCost } from "@/lib/client/format";
import { useCases } from "@/lib/client/hooks";
import { dismissSweep, useSweep, type SweepLine } from "@/lib/client/sweep";
import { duration, ease, spring } from "../../motion";
import { IconButton } from "../../ui/button";
import { cn } from "../../ui/cn";
import { ThinkingMark } from "../../ui/logo";

/** The overnight check, streaming: a progress bar and a live log of what Truce looked at. */
export function SweepPanel() {
  const sweep = useSweep();
  const visible = sweep.status !== "idle";
  const fraction =
    sweep.progress && sweep.progress.total > 0
      ? sweep.progress.done / sweep.progress.total
      : sweep.status === "done"
        ? 1
        : 0.04;
  const seconds =
    sweep.startedAt && sweep.endedAt
      ? Math.max(1, Math.round((sweep.endedAt - sweep.startedAt) / 1000))
      : null;

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.section
          aria-label="Overnight check"
          aria-live="polite"
          initial={{ opacity: 0, height: 0 }}
          animate={{
            opacity: 1,
            height: "auto",
            transition: { duration: duration.slow, ease: ease.out },
          }}
          exit={{ opacity: 0, height: 0, transition: { duration: duration.base, ease: ease.in } }}
          className="overflow-hidden"
        >
          <div className="rounded-card border-line bg-paper mb-6 overflow-hidden border">
            <div className="flex items-center justify-between gap-3 px-5 pt-4">
              <div className="flex items-center gap-3">
                {sweep.status === "running" ? (
                  <ThinkingMark className="size-8" />
                ) : (
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-[9px]",
                      sweep.status === "error" ? "bg-risk-50 text-risk-700" : "bg-ink text-lemon",
                    )}
                  >
                    {sweep.status === "error" ? (
                      <CircleAlert className="size-4" />
                    ) : (
                      <Moon className="size-4" />
                    )}
                  </span>
                )}
                <div>
                  <h2 className="text-ink text-[15px] font-semibold">Overnight check</h2>
                  <p className="text-ink-2 text-[13px]">
                    {sweep.status === "running" && (sweep.progress?.label ?? "Starting")}
                    {sweep.status === "done" &&
                      `Done${seconds ? ` in ${seconds} s` : ""}${sweep.cost > 0 ? ` · ${formatCost(sweep.cost)}` : ""}`}
                    {sweep.status === "error" && (sweep.error ?? "The check stopped early.")}
                  </p>
                </div>
              </div>
              {sweep.status !== "running" && (
                <IconButton label="Close the overnight check" size="sm" onClick={dismissSweep}>
                  <X />
                </IconButton>
              )}
            </div>

            <div className="bg-ink/[0.06] mx-5 mt-4 h-1.5 overflow-hidden rounded-full">
              <motion.div
                className={cn(
                  "h-full rounded-full",
                  sweep.status === "error" ? "bg-risk-500" : "bg-moss",
                )}
                initial={false}
                animate={{ width: `${Math.round(fraction * 100)}%` }}
                transition={{ duration: duration.slow, ease: ease.out }}
              />
            </div>

            <ol className="max-h-64 space-y-1 overflow-y-auto px-5 pt-3 pb-4">
              <AnimatePresence initial={false}>
                {sweep.lines.map((line) => (
                  <motion.li
                    key={line.id}
                    layout
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={spring.layout}
                  >
                    <Line line={line} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>

            {sweep.status === "done" && sweep.result && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="border-line-soft bg-mist/50 text-ink border-t px-5 py-3 text-[13px]"
              >
                Triaged {sweep.result.analyzed} {sweep.result.analyzed === 1 ? "case" : "cases"} and
                flagged {sweep.result.flagged} {sweep.result.flagged === 1 ? "order" : "orders"}{" "}
                before they ship.
              </motion.p>
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function Line({ line }: { line: SweepLine }) {
  const cases = useCases().data?.cases;
  if (line.kind === "progress") {
    return (
      <p className="text-ink-2 flex items-center gap-2.5 py-1 text-[13px]">
        <span className="bg-ink-3 size-1.5 rounded-full" />
        {line.label}
      </p>
    );
  }
  if (line.kind === "case") {
    return (
      <Link
        href={`/app/cases/${encodeURIComponent(line.caseId)}`}
        className="hover:bg-wash -mx-2 flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors"
      >
        <Inbox className="text-moss mt-0.5 size-3.5 shrink-0" />
        <span className="text-ink line-clamp-2 min-w-0">
          <span className="font-medium">
            {cases?.find((c) => c.id === line.caseId)?.buyer.name ?? line.caseId}
          </span>
          <span className="text-ink-2"> · {line.summary}</span>
        </span>
      </Link>
    );
  }
  return (
    <Link
      href={`/app/orders?order=${encodeURIComponent(line.orderId)}`}
      className="hover:bg-wash -mx-2 flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors"
    >
      {line.ok ? (
        <Check className="text-moss mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
      ) : (
        <ShieldAlert className="text-warn-700 mt-0.5 size-3.5 shrink-0" />
      )}
      <span className={cn("min-w-0", line.ok ? "text-ink-2" : "text-ink")}>
        <span className="text-ink font-medium">{line.orderId}</span> · {line.label}
      </span>
    </Link>
  );
}
