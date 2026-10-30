"use client";

import { motion } from "motion/react";
import { Check, X } from "lucide-react";
import type { ProtectionResult } from "@/lib/rules/protection";
import { spring } from "../../motion";
import { cn } from "../../ui/cn";

/**
 * PayPal's Seller Protection, check by check, from the order's facts. Whether it covers the case
 * is on the card's title row.
 */
export function ProtectionChecklist({ result }: { result: ProtectionResult }) {
  return (
    <ul className="space-y-2.5">
      {result.checks.map((check, i) => (
        <li key={check.id} className="flex items-start gap-2.5 text-[14px] leading-snug">
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
  );
}
