"use client";

import { useState } from "react";
import { startSampleOver } from "@/lib/client/actions";
import { errorMessage } from "@/lib/client/api";
import { useShopId } from "@/lib/client/shop-context";
import { Button } from "../../ui/button";
import { Dialog } from "../../ui/overlay";
import { useToast } from "../../ui/toast";

/** Starting a sample shop over, behind a confirmation, from the shop's settings. */
export function useStartOver(onDone?: () => void) {
  const shopId = useShopId();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await startSampleOver(shopId);
      setConfirming(false);
      onDone?.();
      toast({
        title: "Started over",
        description: "Every case, order and approval is back to the start.",
      });
    } catch (e) {
      toast({ title: "Couldn't start over", description: errorMessage(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const dialog = (
    <Dialog
      open={confirming}
      onClose={() => {
        if (!busy) setConfirming(false);
      }}
      title="Start the sample shop over?"
      description="Every case, order and approval goes back to the start, and the conversation with Truce is cleared. Analyses Truce already ran replay from their recordings."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} loading={busy} data-autofocus>
            Start over
          </Button>
        </>
      }
    />
  );

  return { ask: () => setConfirming(true), busy, dialog };
}
