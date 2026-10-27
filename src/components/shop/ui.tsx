import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "../ui/cn";

/** Wick & Ember's own small set of controls: warmer, squarer, quieter than Truce's. */

const base =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[6px] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[18px]";

const variants = {
  primary: "bg-espresso text-linen hover:bg-[#3b2f25]",
  secondary: "border border-hairline bg-parchment text-espresso hover:border-espresso/30",
  quiet: "text-espresso-2 hover:text-espresso",
};

const sizes = {
  md: "h-11 px-5 text-[15px]",
  lg: "h-12 px-6 text-[15px]",
  sm: "h-9 px-3.5 text-sm",
};

export function shopButton(
  variant: keyof typeof variants = "primary",
  size: keyof typeof sizes = "md",
  className?: string,
) {
  return cn(base, variants[variant], sizes[size], className);
}

export function ShopButton({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: { variant?: keyof typeof variants; size?: keyof typeof sizes } & ComponentProps<"button">) {
  return <button type={type} className={shopButton(variant, size, className)} {...props} />;
}

export function ShopLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: { variant?: keyof typeof variants; size?: keyof typeof sizes } & ComponentProps<typeof Link>) {
  return <Link className={shopButton(variant, size, className)} {...props} />;
}

/** The shop's mark: a flame in a soft arch. */
export function EmberMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-6", className)}>
      <path d="M4 22V11a8 8 0 0 1 16 0v11Z" fill="#A7472B" />
      <path
        d="M12.1 6.2c1.4 2.1 3.3 3.9 3.3 6.9a3.4 3.4 0 0 1-6.8 0c0-1.9 1-3 1.9-4.1.2 1.1.7 1.8 1.4 2.1-.4-1.7-.4-3.2.2-4.9Z"
        fill="#FBE2B4"
      />
      <path d="M8 22h8" stroke="#2A211A" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <EmberMark className="size-7" />
      <span className="text-espresso font-serif text-[22px] leading-none font-medium tracking-[-0.01em]">
        Wick &amp; Ember
      </span>
    </span>
  );
}
