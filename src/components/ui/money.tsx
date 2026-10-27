"use client";

import { animate } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatUsd, type Cents } from "@/lib/money";
import { duration, ease } from "../motion";
import { cn } from "./cn";
import { useCalmMotion } from "../use-reduced-motion";

const wholeUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * A number that ticks up to its value, then settles on the exact figure. Screen readers get the
 * final value only. People who prefer less motion see it straight away.
 */
export function AnimatedNumber({
  value,
  format,
  frame,
  delay = 0,
  className,
}: {
  value: number;
  /** The settled figure. */
  format: (value: number) => string;
  /** The figure while it moves; defaults to `format`. */
  frame?: (value: number) => string;
  delay?: number;
  className?: string;
}) {
  const reduced = useCalmMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const current = useRef(0);
  const formats = useRef({ format, frame });
  const [initial] = useState(() => format(reduced ? value : 0));

  useEffect(() => {
    formats.current = { format, frame };
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { format: settle, frame: step = settle } = formats.current;
    if (reduced || current.current === value) {
      current.current = value;
      el.textContent = settle(value);
      return;
    }
    const controls = animate(current.current, value, {
      duration: duration.count,
      ease: ease.out,
      delay,
      onUpdate(v) {
        current.current = v;
        el.textContent = step(v);
      },
      onComplete() {
        current.current = value;
        el.textContent = formats.current.format(value);
      },
    });
    return () => controls.stop();
  }, [value, reduced, delay]);

  return (
    <span className={cn("tabular-nums", className)}>
      <span aria-hidden ref={ref}>
        {initial}
      </span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

/** Money in cents, with tabular figures. `animate` ticks it up from zero. */
export function Money({
  cents,
  animate: tick = false,
  delay,
  className,
}: {
  cents: Cents;
  animate?: boolean;
  delay?: number;
  className?: string;
}) {
  if (tick) {
    return (
      <AnimatedNumber
        value={cents}
        format={formatUsd}
        frame={(v) => wholeUsd.format(Math.round(v / 100))}
        delay={delay}
        className={className}
      />
    );
  }
  return <span className={cn("tabular-nums", className)}>{formatUsd(cents)}</span>;
}
