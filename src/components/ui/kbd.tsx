import type { ReactNode } from "react";
import { cn } from "./cn";

/** A keyboard key, for shortcut hints. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "border-line bg-paper text-ink-2 inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border px-1 font-sans text-[11px] font-medium shadow-[0_1px_0_rgb(30_38_20/0.12)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
