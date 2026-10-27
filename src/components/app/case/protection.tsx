"use client";

import { motion } from "motion/react";
import { Check, ShieldCheck, ShieldX, X } from "lucide-react";
import type { ProtectionResult } from "@/lib/rules/protection";
import { spring } from "../../motion";
import { cn } from "../../ui/cn";

/** PayPal's Seller Protection, check by check, worked out in code from the order's facts. */
export function ProtectionChecklist({ result }: { result: ProtectionResult }) {
  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-[10px] px-3 py-2.5",
          result.covered ? "bg-mist" : "bg-ink/[0.04]",
        )}
      >
        {result.covered ? (
          <ShieldCheck className="text-moss size-5" />
        ) : (
          <ShieldX className="text-ink-2 size-5" />
        )}
        <p className="text-ink text-sm font-medium">
          {result.covered
            ? "Seller Protection covers this case"
            : "Seller Protection doesn't cover this case"}
        </p>
      </div>
      <ul className="mt-3 space-y-2">
        {result.checks.map((check, i) => (
          <li key={check.id} className="flex items-start gap-2.5 text-[13.5px] leading-snug">
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ ...spring.pop, delay: 0.1 + i * 0.05 }}
              className={cn(
                "mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full",
                check.ok ? "bg-lemon text-ink" : "bg-risk-50 text-risk-700",
              )}
            >
              {check.ok ? (
                <Check className="size-3" strokeWidth={3} />
              ) : (
                <X className="size-3" strokeWidth={3} />
              )}
            </motion.span>
            <span className={check.ok ? "text-ink" : "text-ink-2"}>{check.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
