"use client";

import { motion } from "motion/react";
import type { Move } from "@/lib/domain";
import { formatUsd } from "@/lib/money";
import type { MoveCost } from "@/lib/rules/options";
import { MOVE } from "@/lib/client/labels";
import { duration, ease } from "../../motion";
import { cn } from "../../ui/cn";

/**
 * Fight, settle or refund, side by side on one scale: the solid bar is what the seller can expect
 * to lose, the pale bar behind it the worst case. Worked out in code from PayPal's fee rules.
 */
export function CostBars({ options, recommended }: { options: MoveCost[]; recommended: Move }) {
  const max = Math.max(...options.map((o) => o.worst), 1);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h3 className="text-ink text-[15px] font-semibold">What each move costs</h3>
        <div className="text-ink-2 flex items-center gap-3 text-[11px] whitespace-nowrap">
          <span className="flex items-center gap-1.5">
            <span className="bg-ink/40 h-2 w-3 rounded-[3px]" />
            Expected
          </span>
          <span className="flex items-center gap-1.5">
            <span className="bg-ink/[0.12] h-2 w-3 rounded-[3px]" />
            Worst case
          </span>
        </div>
      </div>
      <ul className="space-y-1.5">
        {options.map((o, i) => {
          const isPick = o.move === recommended;
          return (
            <li
              key={o.move}
              className={cn(
                "rounded-[10px] px-3 py-2.5 transition-colors",
                isPick ? "bg-mist" : "bg-transparent",
                !o.available && "opacity-55",
              )}
            >
              <div className="grid grid-cols-[64px_1fr_auto] items-center gap-3">
                <span className="text-ink flex items-center gap-1.5 text-[13px] font-medium">
                  {MOVE[o.move]}
                </span>
                <div className="bg-ink/[0.05] relative h-2.5 rounded-full" aria-hidden>
                  <motion.span
                    className="bg-ink/[0.12] absolute inset-y-0 left-0 origin-left rounded-full"
                    style={{ width: `${(o.worst / max) * 100}%` }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{
                      duration: duration.slower + 0.2,
                      ease: ease.out,
                      delay: 0.1 + i * 0.08,
                    }}
                  />
                  <motion.span
                    className={cn(
                      "absolute inset-y-0 left-0 origin-left rounded-full",
                      isPick ? "bg-moss" : "bg-ink/40",
                    )}
                    style={{ width: `${Math.max(1.5, (o.expected / max) * 100)}%` }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{
                      duration: duration.slower + 0.3,
                      ease: ease.out,
                      delay: 0.25 + i * 0.08,
                    }}
                  />
                </div>
                <span
                  className={cn(
                    "min-w-[52px] text-right text-[13px] tabular-nums",
                    isPick ? "text-ink font-semibold" : "text-ink",
                  )}
                >
                  {formatUsd(o.expected)}
                </span>
              </div>
              <p className="text-ink-2 mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 pl-[76px] text-[11.5px] leading-snug">
                {o.available ? (
                  <>
                    <span>{o.note}</span>
                    <span>Worst {formatUsd(o.worst)}</span>
                    {o.fee > 0 && (
                      <span>{`${formatUsd(o.fee)} fee${o.move === "fight" ? " if you lose" : ""}`}</span>
                    )}
                    <span className={o.countsAsClaim ? "text-warn-700" : "text-moss-deep"}>
                      {o.countsAsClaim
                        ? "Counts toward your ratio"
                        : "Doesn't count toward your ratio"}
                    </span>
                  </>
                ) : (
                  <span>Not available: {o.note.charAt(0).toLowerCase() + o.note.slice(1)}</span>
                )}
              </p>
              {isPick && <span className="sr-only">Recommended</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
