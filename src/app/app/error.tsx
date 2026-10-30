"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Logo } from "@/components/ui/logo";

/** The shop itself couldn't open (its layout broke), so there's no sidebar to fall back on. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-[1200px] items-center px-5 sm:px-8">
        <Link href="/app" aria-label="Truce" className="rounded-md">
          <Logo className="h-8" />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-24">
        <EmptyState
          tone="error"
          icon={<RotateCcw />}
          title="Truce couldn't open this shop"
          description="Nothing was sent or changed. Try again in a moment, or open your shops from the start."
          action={
            <>
              <Button onClick={() => retry()}>Try again</Button>
              <ButtonLink href="/app" variant="secondary">
                Back to Truce
              </ButtonLink>
            </>
          }
        />
      </main>
    </div>
  );
}
