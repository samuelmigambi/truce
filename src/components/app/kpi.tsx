"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { duration, ease } from "../motion";
import { cn } from "../ui/cn";
import { Skeleton } from "../ui/skeleton";

/** A number tile: a label, the figure, and a line of context under it. */
export function Kpi({
  label,
  value,
  hint,
  icon,
  tone = "default",
  index = 0,
  children,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "good" | "warn";
  index?: number;
  children?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base, ease: ease.out, delay: index * 0.04 }}
      className="rounded-card border-line bg-paper relative min-w-0 overflow-hidden border px-3.5 py-3 sm:px-5 sm:py-4"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-ink-2 truncate text-xs font-medium sm:text-[13px]">{label}</p>
        {icon && (
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-lg max-sm:hidden [&_svg]:size-4",
              tone === "good" && "bg-lemon text-ink",
              tone === "warn" && "bg-warn-50 text-warn-700",
              tone === "default" && "bg-ink/[0.05] text-ink-2",
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="text-ink mt-2 text-[20px] leading-none font-semibold tracking-[-0.02em] tabular-nums sm:text-[28px]">
        {value}
      </p>
      {hint && <p className="text-ink-2 mt-2 text-[13px] max-sm:hidden">{hint}</p>}
      {children}
    </motion.div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="rounded-card border-line bg-paper border px-3.5 py-3 sm:px-5 sm:py-4">
      <Skeleton className="h-3.5 w-16 sm:w-24" />
      <Skeleton className="mt-3.5 h-6 w-3/4 sm:h-7" />
      <Skeleton className="mt-3 h-3 w-full max-w-36 max-sm:hidden" />
    </div>
  );
}
