import type { ReactNode } from "react";
import { cn } from "./cn";

/** What a screen shows when there's nothing in it yet, or something went wrong. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "default",
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "default" | "error";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      {icon && (
        <div
          className={cn(
            "rounded-card mb-4 flex size-11 items-center justify-center [&_svg]:size-5",
            tone === "error" ? "bg-risk-50 text-risk-700" : "bg-mist text-moss-deep",
          )}
        >
          {icon}
        </div>
      )}
      <h3 className="text-ink text-[15px] font-semibold">{title}</h3>
      {description && (
        <p className="text-ink-2 mt-1.5 max-w-sm text-sm leading-relaxed text-balance">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
