"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "../ui/cn";

/** A small minus–count–plus control. */
export function Quantity({
  value,
  onChange,
  min = 1,
  max = 9,
  label,
  size = "md",
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
  size?: "sm" | "md";
}) {
  const button =
    "flex items-center justify-center text-espresso-2 transition-colors hover:text-espresso disabled:opacity-35 disabled:hover:text-espresso-2";
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "border-hairline bg-parchment inline-flex items-center rounded-[6px] border",
        size === "sm" ? "h-8" : "h-11",
      )}
    >
      <button
        type="button"
        aria-label="One fewer"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className={cn(button, size === "sm" ? "w-8 [&_svg]:size-3.5" : "w-10 [&_svg]:size-4")}
      >
        <Minus />
      </button>
      <span
        aria-live="polite"
        className={cn(
          "text-espresso text-center font-medium tabular-nums",
          size === "sm" ? "w-5 text-sm" : "w-7",
        )}
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="One more"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className={cn(button, size === "sm" ? "w-8 [&_svg]:size-3.5" : "w-10 [&_svg]:size-4")}
      >
        <Plus />
      </button>
    </div>
  );
}
