"use client";

import { useState, type FormEvent } from "react";
import type { ShopResponse } from "@/lib/api-types";
import { errorMessage, patchJson, shopApi } from "@/lib/client/api";
import type { NotificationPrefs, Shop, User } from "@/lib/domain";
import { DEFAULT_NOTIFICATIONS } from "@/lib/shop-options";
import { Button } from "../ui/button";
import { useToast } from "../ui/toast";
import { NotificationFields } from "../shop-setup";
import { StepFooter, StepFrame, type StepBase } from "./step-frame";

/** The signed-in member's own choices in this shop, or the defaults before they've chosen. */
export function prefsOf(shop: Shop, uid: string): NotificationPrefs {
  return shop.members[uid]?.notifications ?? DEFAULT_NOTIFICATIONS;
}

/** Step 5: what Truce tells the seller about. In the app now; email when delivery opens. */
export function NotificationsStep({
  user,
  shop,
  onUpdated,
  onNext,
  ...base
}: StepBase & {
  user: User;
  shop: Shop;
  onUpdated: (shop: Shop) => void;
  onNext: () => void;
}) {
  const [prefs, setPrefs] = useState(() => prefsOf(shop, user.uid));
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const response = await patchJson<ShopResponse>(shopApi(shop.id), {
        notifications: prefs,
        setupStep: "review",
      });
      onUpdated(response.shop);
      onNext();
    } catch (problem) {
      toast({ key: "onboarding", tone: "error", title: errorMessage(problem) });
      setSaving(false);
    }
  }

  return (
    <StepFrame
      {...base}
      title="Choose what Truce tells you about"
      description="Notifications show in the app as things happen. You can change these any time."
      onSubmit={submit}
      footer={
        <StepFooter onBack={base.onBack}>
          <Button type="submit" loading={saving}>
            Continue
          </Button>
        </StepFooter>
      }
    >
      <NotificationFields value={prefs} onChange={setPrefs} disabled={saving} />
    </StepFrame>
  );
}
