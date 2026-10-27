"use client";

import { motion } from "motion/react";
import { UserRoundCheck } from "lucide-react";
import type { ModelTier } from "@/lib/client/labels";
import { duration, ease } from "../motion";
import { cn } from "../ui/cn";
import { ModelSwatch } from "../ui/model-badge";

/** How a case moves through Truce: each step and the model (or plain code) that does it. */

const STEPS: { label: string; who: string; tier: ModelTier | "you" }[] = [
  { label: "Read", who: "Lightning", tier: "lightning" },
  { label: "Gather", who: "Lightning", tier: "lightning" },
  { label: "Protect", who: "Plain code", tier: "code" },
  { label: "Weigh", who: "Plain code", tier: "code" },
  { label: "Decide", who: "Ultra", tier: "ultra" },
  { label: "Draft", who: "Super VL", tier: "super" },
  { label: "Check", who: "Ultra", tier: "ultra" },
  { label: "Approve", who: "You", tier: "you" },
];

export function Pipeline() {
  return (
    <div className="relative">
      {/* The rail, with a dot that travels it */}
      <div
        aria-hidden
        className="bg-line-strong absolute top-[27px] right-[6%] left-[6%] hidden h-px lg:block"
      >
        <span className="pipeline-dot bg-moss absolute top-1/2 left-0 size-2 -translate-y-1/2 rounded-full shadow-[0_0_0_4px_rgb(221_235_148/0.7)] motion-reduce:hidden" />
      </div>
      <div
        aria-hidden
        className="bg-line-strong absolute top-6 bottom-6 left-[21px] w-px sm:hidden"
      />
      <ol className="relative grid grid-cols-1 gap-3 sm:grid-cols-4 sm:gap-y-8 lg:grid-cols-8 lg:gap-2">
        {STEPS.map((s, i) => (
          <motion.li
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: duration.base, ease: ease.out, delay: i * 0.05 }}
            className="flex items-center gap-4 sm:flex-col sm:gap-0 sm:text-center"
          >
            <span
              className={cn(
                "relative flex size-11 shrink-0 items-center justify-center rounded-[12px] border text-sm font-semibold tabular-nums sm:size-14 sm:rounded-[14px]",
                s.tier === "you" ? "border-ink bg-ink text-lemon" : "border-line bg-paper text-ink",
              )}
            >
              {s.tier === "you" ? <UserRoundCheck className="size-5" /> : i + 1}
            </span>
            <span className="flex flex-1 items-center justify-between gap-3 sm:flex-col sm:justify-start sm:gap-0">
              <span className="text-ink text-sm font-semibold sm:mt-3">{s.label}</span>
              <span className="text-ink-2 inline-flex items-center gap-1.5 text-xs sm:mt-1">
                {s.tier !== "you" && <ModelSwatch tier={s.tier} />}
                {s.who}
              </span>
            </span>
          </motion.li>
        ))}
      </ol>
      <style>{`
        .pipeline-dot { animation: pipeline-travel 6s cubic-bezier(0.65,0,0.35,1) infinite; }
        @keyframes pipeline-travel {
          0% { left: 0%; opacity: 0; }
          6% { opacity: 1; }
          90% { opacity: 1; }
          100% { left: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
