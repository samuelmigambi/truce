"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { shopHref } from "@/lib/client/api";
import { useShopId } from "@/lib/client/shop-context";

/** Anything that breaks inside a shop's screen lands here, inside the shell, with a way back. */
export default function ShopError({ error, retry }: { error: unknown; retry: () => void }) {
  const shopId = useShopId();
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
          <ButtonLink href={shopHref(shopId, "cases")} variant="secondary">
            Back to cases
          </ButtonLink>
        </>
      }
    />
  );
}
