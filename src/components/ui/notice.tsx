import type { ReactNode } from "react";
import { cn } from "./cn";

const tones = {
  info: { box: "border-mist-line bg-mist/60", icon: "text-moss-deep", body: "text-ink-2" },
  warn: { box: "border-warn-200 bg-warn-50", icon: "text-warn-700", body: "text-ink-2" },
  risk: { box: "border-risk-200 bg-risk-50", icon: "text-risk-700", body: "text-ink-2" },
} as const;

/**
 * A callout inside a screen: something worth knowing, or something to fix, with the one action
 * that helps. Calm by default; amber or red only when it costs the seller something.
 */
export function Notice({
  tone = "info",
  icon,
  title,
  children,
  action,
  className,
  role,
}: {
  tone?: keyof typeof tones;
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  role?: "status" | "alert";
}) {
  const t = tones[tone];
  return (
    <div
      role={role}
      className={cn(
        "rounded-card flex flex-col gap-3 border px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4",
        t.box,
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {icon && (
          <span className={cn("mt-px shrink-0 [&_svg]:size-[18px]", t.icon)} aria-hidden>
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-ink text-[14px] leading-snug font-medium">{title}</p>
          {children && (
            <div className={cn("mt-0.5 text-[13px] leading-relaxed", t.body)}>{children}</div>
          )}
        </div>
      </div>
      {action && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 max-sm:pl-[30px]">{action}</div>
      )}
    </div>
  );
}
