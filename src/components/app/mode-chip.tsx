"use client";

import type { Workspace } from "@/lib/domain";
import { useNow } from "@/lib/client/now";
import { cn } from "../ui/cn";
import { Tooltip } from "../ui/tooltip";

const DAY = 24 * 60 * 60 * 1000;

/** Which mode the app is in, always on screen: a private demo copy, or the live PayPal sandbox. */
export function ModeChip({
  workspace,
  className,
  compact = false,
}: {
  workspace: Workspace;
  className?: string;
  compact?: boolean;
}) {
  const now = useNow();
  const live = workspace.kind === "live";
  const days = workspace.expiresAt
    ? Math.max(1, Math.ceil((new Date(workspace.expiresAt).getTime() - now) / DAY))
    : null;
  const hint = live
    ? "Connected to the PayPal sandbox. Approving a case calls PayPal for real."
    : `Your own copy of the demo shop. Nemotron runs for real; PayPal calls are simulated and recorded.${
        days ? ` It resets in ${days} ${days === 1 ? "day" : "days"}.` : ""
      }`;

  return (
    <Tooltip content={hint} side="bottom" className={className}>
      <span
        tabIndex={0}
        className={cn(
          "rounded-chip inline-flex h-6 items-center gap-1.5 border px-2 text-xs font-medium whitespace-nowrap",
          live ? "border-ink bg-ink text-cream" : "bg-mist text-ink border-[#e3eab8]",
        )}
      >
        <span className={cn("relative flex size-1.5", live ? "text-lemon" : "text-moss")}>
          {live && (
            <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-70 motion-reduce:hidden" />
          )}
          <span className="relative size-1.5 rounded-full bg-current" />
        </span>
        {live ? "Live sandbox" : compact ? "Demo" : "Demo copy"}
      </span>
    </Tooltip>
  );
}
