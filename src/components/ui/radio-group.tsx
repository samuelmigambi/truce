"use client";

import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { spring } from "../motion";
import { cn } from "./cn";

/**
 * Choices drawn two ways: a segmented control for short options (sandbox or live), and cards
 * for a choice between paths. Real radio buttons sit underneath, so arrow keys move between the
 * options and screen readers say "1 of 2" as they would for any radio group.
 */

export interface RadioOption<T extends string> {
  value: T;
  label: ReactNode;
  /** A line under the label (cards only). */
  description?: ReactNode;
  /** An icon beside the label (cards only). */
  icon?: ReactNode;
  disabled?: boolean;
}

interface RadioGroupProps<T extends string> {
  options: RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers, unless `labelledBy` points at a visible label. */
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  disabled?: boolean;
  className?: string;
}

const ring =
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-moss";

export function RadioSegments<T extends string>({
  options,
  value,
  onChange,
  label,
  labelledBy,
  describedBy,
  disabled = false,
  className,
  size = "md",
}: RadioGroupProps<T> & { size?: "sm" | "md" }) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={cn(
        "rounded-btn bg-ink/[0.05] inline-flex max-w-full items-center gap-0.5 p-[3px]",
        disabled && "opacity-60",
        className,
      )}
    >
      {options.map((option) => {
        const checked = option.value === value;
        const off = disabled || option.disabled;
        return (
          <label
            key={option.value}
            className={cn(
              "relative inline-flex shrink-0 items-center justify-center rounded-[8px] font-medium whitespace-nowrap transition-colors duration-150 select-none",
              size === "sm" ? "h-7 min-w-10 px-2.5 text-[13px]" : "h-8 min-w-16 px-3 text-sm",
              checked ? "text-ink" : "text-ink-2",
              off ? "cursor-not-allowed" : "hover:text-ink cursor-pointer",
              ring,
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              disabled={off}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {checked && (
              <motion.span
                layoutId={`${name}-thumb`}
                transition={spring.snappy}
                className="border-line bg-paper absolute inset-0 rounded-[8px] border shadow-[0_1px_2px_rgb(30_38_20/0.08)]"
              />
            )}
            <span className="relative">{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}

export function RadioCards<T extends string>({
  options,
  value,
  onChange,
  label,
  labelledBy,
  describedBy,
  disabled = false,
  className,
}: RadioGroupProps<T>) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={cn("grid gap-3 sm:grid-cols-2", className)}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        const off = disabled || option.disabled;
        const labelId = `${name}-${index}-label`;
        const descriptionId = `${name}-${index}-description`;
        return (
          <label
            key={option.value}
            className={cn(
              "rounded-card bg-paper relative flex gap-3.5 border p-4 transition-[border-color,box-shadow,background-color] duration-150",
              checked
                ? "border-ink shadow-[inset_0_0_0_1px_var(--color-ink)]"
                : "border-line hover:border-line-strong",
              off ? "cursor-not-allowed opacity-55" : "cursor-pointer",
              ring,
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              disabled={off}
              onChange={() => onChange(option.value)}
              aria-labelledby={labelId}
              aria-describedby={option.description ? descriptionId : undefined}
              className="sr-only"
            />
            {option.icon && (
              <span
                aria-hidden
                className={cn(
                  "rounded-btn flex size-9 shrink-0 items-center justify-center transition-colors duration-150 [&_svg]:size-[18px]",
                  checked ? "bg-lemon text-ink" : "bg-mist text-moss-deep",
                )}
              >
                {option.icon}
              </span>
            )}
            <span className="min-w-0 flex-1 pr-7">
              <span id={labelId} className="text-ink block text-[15px] leading-5 font-semibold">
                {option.label}
              </span>
              {option.description && (
                <span
                  id={descriptionId}
                  className="text-ink-2 mt-1 block text-[13px] leading-5 text-pretty"
                >
                  {option.description}
                </span>
              )}
            </span>
            <span
              aria-hidden
              className={cn(
                "absolute top-4 right-4 flex size-[18px] items-center justify-center rounded-full border transition-colors duration-150",
                checked ? "border-ink bg-ink" : "border-line-strong bg-paper",
              )}
            >
              {checked && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={spring.pop}
                  className="bg-lemon size-[7px] rounded-full"
                />
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
