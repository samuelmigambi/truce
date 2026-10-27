"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Anything that breaks inside an app screen lands here, with a way back. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      tone="error"
      className="pt-32"
      icon={<RotateCcw />}
      title="This screen hit a problem"
      description="Nothing was sent or changed. Try again, or go back to your cases."
      action={
        <>
          <Button onClick={() => retry()}>Try again</Button>
          <ButtonLink href="/app" variant="secondary">
            Back to cases
          </ButtonLink>
        </>
      }
    />
  );
}
