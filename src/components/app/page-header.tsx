import type { ReactNode } from "react";
import { cn } from "../ui/cn";

/** Every app screen opens the same way: a title, with actions on the right. */
export function PageHeader({
  title,
  actions,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <h1 className="text-ink min-w-0 text-[26px] leading-tight font-semibold tracking-[-0.02em]">
        {title}
      </h1>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** The width and padding every app screen shares. */
export function Screen({
  children,
  className,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 pt-6 pb-24 sm:px-8 sm:pt-8",
        wide ? "max-w-[1360px]" : "max-w-[1200px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
