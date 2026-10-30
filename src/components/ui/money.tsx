"use client";

import { animate } from "motion/react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { formatMoney, formatMoneyWhole, type Cents } from "@/lib/money";
import { duration, ease } from "../motion";
import { cn } from "./cn";
import { useCalmMotion } from "../use-reduced-motion";

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

const CurrencyContext = createContext("USD");

/** The currency amounts show in when a `Money` doesn't name one: the shop's own. */
export function CurrencyProvider({
  currency,
  children,
}: {
  currency: string;
  children: ReactNode;
}) {
  return <CurrencyContext.Provider value={currency}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): string {
  return useContext(CurrencyContext);
}

/** Money in cents, with tabular figures. `animate` ticks it up from zero. */
export function Money({
  cents,
  currency,
  animate: tick = false,
  delay,
  className,
}: {
  cents: Cents;
  /** Defaults to the shop's currency. */
  currency?: string;
  animate?: boolean;
  delay?: number;
  className?: string;
}) {
  const shopCurrency = useCurrency();
  const code = currency ?? shopCurrency;
  if (tick) {
    return (
      <AnimatedNumber
        value={cents}
        format={(v) => formatMoney(v, code)}
        frame={(v) => formatMoneyWhole(v, code)}
        delay={delay}
        className={className}
      />
    );
  }
  return <span className={cn("tabular-nums", className)}>{formatMoney(cents, code)}</span>;
}
