"use client";

import { FlaskConical } from "lucide-react";
import { useState } from "react";
import type { ShopResponse } from "@/lib/api-types";
import { errorMessage, patchJson, shopApi } from "@/lib/client/api";
import type { Shop } from "@/lib/domain";
import { Button } from "../ui/button";
import { useToast } from "../ui/toast";
import { PayPalConnect } from "../shop-setup";
import { StepFooter, StepFrame, type StepBase } from "./step-frame";
import { shopReached } from "./steps";

/**
 * Step 3: PayPal. A real shop connects its own REST app here; a sample shop says PayPal is
 * simulated. Someone without a PayPal app yet can explore a sample shop instead, and their
 * draft stays saved.
 */
export function PayPalStep({
  shop,
  onUpdated,
  onNext,
  onExploreSample,
  ...base
}: StepBase & {
  shop: Shop;
  onUpdated: (shop: Shop) => void;
  onNext: () => void;
  /** Makes a separate sample shop; resolves once onboarding has moved to it. */
  onExploreSample: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [exploring, setExploring] = useState(false);
  const toast = useToast();
  const real = shop.kind === "real";
  const connected = !real || shop.paypal !== null;

  async function next() {
    if (saving) return;
    if (!connected) {
      toast({
        key: "onboarding",
        tone: "warning",
        title: "Connect your PayPal app first, or explore with a sample shop for now.",
      });
      return;
    }
    setSaving(true);
    try {
      if (!shopReached(shop, "policies")) {
        const response = await patchJson<ShopResponse>(shopApi(shop.id), {
          setupStep: "policies",
        });
        onUpdated(response.shop);
      }
      onNext();
    } catch (problem) {
      toast({ key: "onboarding", tone: "error", title: errorMessage(problem) });
      setSaving(false);
    }
  }

  async function explore() {
    if (exploring) return;
    setExploring(true);
    try {
      await onExploreSample();
    } catch (problem) {
      toast({ key: "onboarding", tone: "error", title: errorMessage(problem) });
    } finally {
      setExploring(false);
    }
  }

  return (
    <StepFrame
      {...base}
      title={real ? "Connect PayPal" : "PayPal in the sample shop"}
      description={
        real
          ? "Truce reads your disputes and orders from PayPal, and answers only when you approve."
          : "The sample shop shows everything Truce does, without touching a real PayPal account."
      }
      footer={
        <StepFooter
          onBack={base.onBack}
          note={connected ? undefined : "Connect PayPal to continue"}
        >
          <Button onClick={next} loading={saving} variant={connected ? "primary" : "secondary"}>
            Continue
          </Button>
        </StepFooter>
      }
    >
      <div className="space-y-6">
        <PayPalConnect
          shop={shop}
          variant="onboarding"
          onConnected={(response) => {
            onUpdated(response.shop);
          }}
        />

        {real && !shop.paypal && (
          <p className="border-line-soft text-ink-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-5 text-[13px]">
            <FlaskConical aria-hidden className="text-moss size-3.5" />
            No PayPal app yet?
            <button
              type="button"
              onClick={explore}
              disabled={exploring}
              className="text-moss-deep font-medium underline-offset-2 hover:underline disabled:opacity-50"
            >
              {exploring ? "Making the sample shop…" : "Explore with a sample shop instead"}
            </button>
          </p>
        )}
      </div>
    </StepFrame>
  );
}
