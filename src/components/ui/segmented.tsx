"use client";

import { motion } from "motion/react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { spring } from "../motion";
import { cn } from "./cn";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

/**
 * Tabs for switching a view in place, such as the inbox filters. The white indicator slides to
 * the chosen option. Arrow keys move between options, as in any tab list.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = "md",
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the control for screen readers. */
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "no-scrollbar rounded-btn bg-ink/[0.05] inline-flex max-w-full items-center gap-0.5 overflow-x-auto p-[3px]",
        className,
      )}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-1.5 rounded-[8px] font-medium whitespace-nowrap transition-colors duration-150",
              size === "sm" ? "h-7 px-2.5 text-[13px]" : "h-8 px-3 text-[13px] sm:text-sm",
              active ? "text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={spring.snappy}
                className="border-line bg-paper absolute inset-0 rounded-[8px] border shadow-[0_1px_2px_rgb(30_38_20/0.08)]"
              />
            )}
            <span className="relative">{option.label}</span>
            {option.count !== undefined && (
              <span
                className={cn(
                  "relative inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] tabular-nums transition-colors",
                  active ? "bg-ink text-cream" : "bg-ink/[0.07] text-ink-2",
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
