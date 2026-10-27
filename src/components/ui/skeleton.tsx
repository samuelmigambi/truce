import { cn } from "./cn";

/** A placeholder block with a quiet shimmer, shaped like the content that's loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("shimmer bg-ink/[0.06] rounded-md", className)} />;
}

/** A few lines of text-shaped skeleton. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-3/5" : "w-full")} />
      ))}
    </div>
  );
}
