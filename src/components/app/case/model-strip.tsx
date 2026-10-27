"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Zap } from "lucide-react";
import { useState } from "react";
import type { AnalysisStepId, ModelStep } from "@/lib/domain";
import { formatCost, formatMs, formatTokens } from "@/lib/client/format";
import { modelTier, STEPS, shortModelName } from "@/lib/client/labels";
import { duration, ease } from "../../motion";
import { Button } from "../../ui/button";
import { cn } from "../../ui/cn";
import { ModelBadge, TIER_SWATCH } from "../../ui/model-badge";
import { Tooltip } from "../../ui/tooltip";

interface Row {
  id: AnalysisStepId;
  label: string;
  model: string | null;
  input: number;
  output: number;
  cached: number;
  cost: number | null;
  ms: number;
}

/** One row per pipeline step, with every model call in it added up. */
function rows(steps: ModelStep[]): Row[] {
  return STEPS.map((s) => {
    const calls = steps.filter((m) => m.step === s.id);
    const priced = calls.filter((c) => c.cost !== null);
    return {
      id: s.id,
      label: s.label,
      model: calls[0]?.model ?? null,
      input: calls.reduce((n, c) => n + c.inputTokens, 0),
      output: calls.reduce((n, c) => n + c.outputTokens, 0),
      cached: calls.reduce((n, c) => n + c.cachedTokens, 0),
      cost:
        calls.length === 0
          ? 0
          : priced.length
            ? priced.reduce((n, c) => n + (c.cost ?? 0), 0)
            : null,
      ms: calls.reduce((n, c) => n + c.ms, 0),
    };
  });
}

/**
 * Which Nemotron model did which step, and what the case cost. Lightning sorts, Ultra decides
 * and checks, Super VL drafts; Seller Protection and the costs are plain code.
 */
export function ModelStrip({
  steps,
  totalCost,
  replayed = false,
  onRunLive,
  running = false,
}: {
  steps: ModelStep[];
  totalCost: number;
  replayed?: boolean;
  onRunLive?: () => void;
  running?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const list = rows(steps);
  const totalMs = list.reduce((n, r) => n + r.ms, 0);
  const timed = list.filter((r) => r.ms > 0);
  const models = Array.from(new Set(steps.map((s) => s.model)));

  return (
    <div className="rounded-card border-line bg-paper border">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <div>
          <h3 className="text-ink text-[15px] font-semibold">How Truce got here</h3>
          <p className="text-ink-2 mt-0.5 text-[13px] tabular-nums">
            {formatCost(totalCost)} for this case
            {totalMs > 0 && ` · ${formatMs(totalMs)} of model time`}
            {replayed && " · replayed from a recorded live run"}
          </p>
        </div>
        {onRunLive && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Zap />}
            onClick={onRunLive}
            loading={running}
          >
            Run again live
          </Button>
        )}
      </div>

      {timed.length > 0 && (
        <div className="mt-4 px-5">
          <div className="flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full">
            {timed.map((r, i) => (
              <Tooltip
                key={r.id}
                content={`${r.label} · ${shortModelName(r.model)} · ${formatCost(r.cost)} · ${formatMs(r.ms)}`}
                className="h-full"
                style={{ width: `${Math.max(2, (r.ms / totalMs) * 100)}%` }}
                delay={120}
              >
                <motion.span
                  tabIndex={0}
                  aria-label={`${r.label}: ${shortModelName(r.model)}, ${formatCost(r.cost)}`}
                  className={cn(
                    "block h-full w-full origin-left rounded-[3px]",
                    TIER_SWATCH[modelTier(r.model)],
                  )}
                  initial={{ opacity: 0, scaleX: 0 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  transition={{ duration: duration.slow, ease: ease.out, delay: i * 0.04 }}
                />
              </Tooltip>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
            {models.map((m) => (
              <ModelBadge key={m} model={m} full className="text-[11px]" />
            ))}
            <ModelBadge model={null} className="text-[11px]" />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="border-line-soft text-ink-2 hover:text-ink mt-3 flex w-full items-center justify-between border-t px-5 py-2.5 text-[13px] font-medium transition-colors"
      >
        {open ? "Hide the steps" : "Show every step"}
        <ChevronDown
          className={cn("size-4 transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: duration.base, ease: ease.out }}
            className="overflow-hidden"
          >
            <table className="w-full text-[13px]">
              <caption className="sr-only">Model calls by step</caption>
              <thead>
                <tr className="border-line-soft text-ink-3 border-t text-left text-xs">
                  <th scope="col" className="py-2 pl-5 font-medium">
                    Step
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Done by
                  </th>
                  <th scope="col" className="py-2 text-right font-medium max-sm:hidden">
                    Tokens
                  </th>
                  <th scope="col" className="py-2 pr-5 text-right font-medium">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody className="divide-line-soft divide-y">
                {list.map((r) => (
                  <tr key={r.id}>
                    <td className="text-ink py-2 pl-5">{r.label}</td>
                    <td className="py-2">
                      <ModelBadge model={r.model} />
                    </td>
                    <td className="text-ink-2 py-2 text-right tabular-nums max-sm:hidden">
                      {r.input + r.output > 0
                        ? `${formatTokens(r.input)} in · ${formatTokens(r.output)} out`
                        : "—"}
                    </td>
                    <td className="text-ink py-2 pr-5 text-right tabular-nums">
                      {r.model ? formatCost(r.cost) : "Free"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
