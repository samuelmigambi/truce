"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { duration, ease } from "../motion";

/** Fades and rises into place the first time it scrolls into view. */
export function Reveal({
  children,
  delay = 0,
  y = 10,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: duration.slow, ease: ease.out, delay }}
    >
      {children}
    </motion.div>
  );
}

/** A lemon highlighter stroke that sweeps in behind a few words of the headline. */
export function HeroHighlight({ children }: { children: ReactNode }) {
  return (
    <span className="relative isolate inline-block whitespace-nowrap">
      <motion.span
        aria-hidden
        className="bg-lemon absolute inset-x-[-0.06em] bottom-[0.06em] -z-10 h-[0.42em] origin-left rounded-[0.12em]"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: duration.slower + 0.25, ease: ease.out, delay: 0.45 }}
      />
      {children}
    </span>
  );
}

/** The same rise for content above the fold, in plain CSS so it shows before hydration. */
export function Rise({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <div className={`animate-fade-rise ${className ?? ""}`} style={{ animationDelay: `${delay}s` }}>
      {children}
    </div>
  );
}
