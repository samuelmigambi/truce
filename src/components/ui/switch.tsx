import type { ComponentProps } from "react";
import { cn } from "./cn";

/**
 * An on/off setting that takes effect as it's flipped, such as a notification. It's a button
 * with role="switch", so a <label htmlFor> names it and clicking the label flips it too. Off
 * shows a small grey knob on an outlined track, so the state never relies on color alone.
 */
export function Switch({
  checked,
  onCheckedChange,
  className,
  ...props
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
} & Omit<ComponentProps<"button">, "onChange" | "onClick" | "role" | "type" | "value">) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-[background-color,border-color] duration-150 ease-out",
        "disabled:cursor-not-allowed disabled:opacity-45",
        checked
          ? "border-moss bg-moss hover:border-moss-deep hover:bg-moss-deep"
          : "bg-paper border-ink/30 hover:border-ink/50",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 left-[3px] size-4 -translate-y-1/2 rounded-full",
          "transition-[translate,scale,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          checked
            ? "bg-paper translate-x-4 scale-110 shadow-[0_1px_2px_rgb(30_38_20/0.3)]"
            : "bg-ink-3 scale-75",
        )}
      />
    </button>
  );
}
