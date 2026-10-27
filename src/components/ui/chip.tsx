import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "neutral" | "outline" | "mist" | "lemon" | "moss" | "warn" | "risk" | "ink";

const tones: Record<Tone, string> = {
  neutral: "bg-ink/[0.055] text-ink-2 border-transparent",
  outline: "bg-paper text-ink-2 border-line",
  mist: "bg-mist text-ink border-[#e3eab8]",
  lemon: "bg-lemon text-ink border-[#cfdf7f]",
  moss: "bg-moss/[0.09] text-moss-deep border-moss/15",
  warn: "bg-warn-50 text-warn-700 border-warn-200",
  risk: "bg-risk-50 text-risk-700 border-risk-200",
  ink: "bg-ink text-cream border-ink",
};

const dots: Record<Tone, string> = {
  neutral: "bg-ink-3",
  outline: "bg-ink-3",
  mist: "bg-moss",
  lemon: "bg-ink",
  moss: "bg-moss",
  warn: "bg-warn-500",
  risk: "bg-risk-500",
  ink: "bg-lemon",
};

/** A small label: a reason, a stage, a move. Sentence case, never shouted. */
export function Chip({
  tone = "neutral",
  size = "md",
  dot = false,
  icon,
  className,
  children,
  ...props
}: {
  tone?: Tone;
  size?: "sm" | "md";
  dot?: boolean;
  icon?: ReactNode;
} & ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "rounded-chip inline-flex max-w-full shrink-0 items-center gap-1.5 border leading-none font-medium whitespace-nowrap",
        size === "sm"
          ? "h-5 px-1.5 text-[11px] [&_svg]:size-3"
          : "h-6 px-2 text-xs [&_svg]:size-3.5",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dots[tone])} />}
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** A count next to a nav item or a filter. */
export function CountBadge({
  value,
  active = false,
  className,
}: {
  value: number;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums",
        active ? "bg-ink text-cream" : "bg-ink/[0.07] text-ink-2",
        className,
      )}
    >
      {value}
    </span>
  );
}

/** A dot that says how something stands. */
export function StatusDot({
  tone = "neutral",
  pulse = false,
  className,
}: {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span aria-hidden className={cn("relative inline-flex size-2 shrink-0", className)}>
      {pulse && (
        <span
          className={cn(
            "absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden",
            dots[tone],
          )}
        />
      )}
      <span className={cn("relative size-2 rounded-full", dots[tone])} />
    </span>
  );
}
