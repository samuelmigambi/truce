import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "lemon" | "ghost" | "danger" | "inverse";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-btn font-medium " +
  "transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ease-out " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-lemon text-ink hover:bg-lemon-deep",
  secondary:
    "border border-line bg-paper text-ink shadow-[0_1px_0_rgb(30_38_20/0.04)] hover:border-line-strong hover:bg-paper-hover",
  lemon: "bg-lemon text-ink hover:bg-lemon-deep",
  ghost: "text-ink-2 hover:bg-wash hover:text-ink",
  danger: "border border-risk-200 bg-paper text-risk-700 hover:bg-risk-50",
  /** For the brand's always-dark areas. */
  inverse: "border border-chalk/20 text-chalk hover:border-chalk/35 hover:bg-chalk/10",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] [&_svg]:size-3.5",
  md: "h-9 px-3.5 text-sm [&_svg]:size-4",
  lg: "h-11 px-5 text-[15px] [&_svg]:size-[18px]",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cn(base, variants[variant], sizes[size], className);
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** An icon before the label. */
  icon?: ReactNode;
  /** An icon after the label. */
  trailing?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  trailing,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: CommonProps & ComponentProps<"button"> & { loading?: boolean }) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
      {trailing}
    </button>
  );
}

/** A link that looks like a button. */
export function ButtonLink({
  variant = "primary",
  size = "md",
  icon,
  trailing,
  className,
  children,
  ...props
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClass(variant, size, className)} {...props}>
      {icon}
      {children}
      {trailing}
    </Link>
  );
}

const iconSizes: Record<ButtonSize, string> = {
  sm: "size-8 [&_svg]:size-4",
  md: "size-9 [&_svg]:size-[18px]",
  lg: "size-11 [&_svg]:size-5",
};

/** A square button with an icon only; `label` names it for screen readers. */
export function IconButton({
  label,
  variant = "ghost",
  size = "md",
  className,
  children,
  type = "button",
  ...props
}: { label: string; variant?: ButtonVariant; size?: ButtonSize } & ComponentProps<"button">) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      // Never squeezed by a long title beside it: the icon button stays square.
      className={cn(base, variants[variant], iconSizes[size], "shrink-0 px-0", className)}
      {...props}
    >
      {children}
    </button>
  );
}
