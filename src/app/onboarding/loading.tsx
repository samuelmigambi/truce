import { Logo } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";

/** While the saved setup loads: the same frame, in quiet placeholders. */
export default function OnboardingLoading() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy="true">
      <header className="bg-cream/85 sticky top-0 z-30">
        <div className="flex h-16 w-full items-center justify-between px-4 sm:px-8">
          <Logo className="h-7 sm:h-8" />
          <Skeleton className="size-9 rounded-full" />
        </div>
      </header>
      <div className="mx-auto w-full max-w-[720px] flex-1 px-4 pt-6 pb-20 sm:px-8 sm:pt-10 lg:pt-14">
        <div className="rounded-panel border-line bg-paper border p-5 sm:p-8">
          <p className="sr-only" role="status">
            Loading your setup
          </p>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-3/4" />
          <Skeleton className="mt-3 h-4 w-full max-w-[460px]" />
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-24 rounded-[12px]" />
            <Skeleton className="h-24 rounded-[12px]" />
          </div>
          <div className="mt-6 space-y-5">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-10 w-full rounded-[10px]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
