"use client";

import { Check, Minus, RefreshCw, TriangleAlert } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import type { ShopResponse } from "@/lib/api-types";
import { errorMessage, patchJson, shopApi } from "@/lib/client/api";
import { PAYPAL_FEATURES } from "@/lib/client/labels";
import type { NotificationPrefs, PolicySource, Shop, User } from "@/lib/domain";
import { CURRENCY_LABELS, TIME_ZONES } from "@/lib/shop-options";
import { Button } from "../ui/button";
import { Chip } from "../ui/chip";
import { cn } from "../ui/cn";
import { useToast } from "../ui/toast";
import { EnvironmentChip, featureOn, shortKey } from "../shop-setup";
import { zoneCity } from "../shop-setup/fields";
import { prefsOf } from "./notifications-step";
import { StepFooter, StepFrame, type StepBase } from "./step-frame";
import { shopReached, type StepId } from "./steps";
import type { SyncRun } from "./sync-run";
import { VerifyEmail } from "./verify-email";

const count = new Intl.NumberFormat("en-US");

/** "https://wickandember.com/policies/returns" → "wickandember.com/policies/returns". */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function zoneLabel(zone: string): string {
  return TIME_ZONES.find((z) => z.value === zone)?.label ?? zoneCity(zone);
}

function notificationSummary(prefs: NotificationPrefs): string {
  const on = [
    prefs.newDisputes && "new disputes",
    prefs.buyerReplies && "buyer replies",
    prefs.deadlines &&
      `deadlines (${prefs.deadlineDays} ${prefs.deadlineDays === 1 ? "day" : "days"} before)`,
    prefs.decisions && "PayPal decisions",
  ].filter((item): item is string => Boolean(item));
  if (on.length === 0) return "Nothing for now";
  const text = on.length === 1 ? on[0]! : `${on.slice(0, -1).join(", ")} and ${on[on.length - 1]}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Step 6: everything at a glance, each part with a way back to change it, then the first sync.
 */
export function ReviewStep({
  user,
  shop,
  sync,
  onEdit,
  onStart,
  onWatch,
  onUser,
  onUpdated,
  ...base
}: StepBase & {
  user: User;
  shop: Shop;
  sync: SyncRun | null;
  onEdit: (step: StepId) => void;
  onStart: () => void;
  onWatch: () => void;
  onUser: (user: User) => void;
  onUpdated: (shop: Shop) => void;
}) {
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const sample = shop.kind === "sample";
  const prefs = prefsOf(shop, user.uid);
  const running = sync?.status === "running";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (running) {
      onWatch();
      return;
    }
    setSaving(true);
    try {
      if (!shopReached(shop, "review")) {
        const response = await patchJson<ShopResponse>(shopApi(shop.id), { setupStep: "review" });
        onUpdated(response.shop);
      }
      onStart();
    } catch (problem) {
      toast({ key: "onboarding", tone: "error", title: errorMessage(problem) });
      setSaving(false);
    }
  }

  return (
    <StepFrame
      {...base}
      title="Check everything over"
      description="Change anything you like before the first sync. You can edit all of it later in Settings too."
      onSubmit={submit}
      footer={
        <StepFooter onBack={base.onBack}>
          <Button type="submit" loading={saving}>
            {running ? "Watch the sync" : "Start the first sync"}
          </Button>
        </StepFooter>
      }
    >
      <div className="space-y-3">
        <Section title="Your account">
          <Fact label="Name">{user.name}</Fact>
          <Fact label="Email">
            <div className="space-y-2.5">
              {user.emailVerified ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span className="break-words">{user.email}</span>
                  <Chip tone="moss" size="sm" icon={<Check />}>
                    Verified
                  </Chip>
                </span>
              ) : (
                <VerifyEmail user={user} onVerified={onUser} compact />
              )}
            </div>
          </Fact>
        </Section>

        <Section
          title="Your shop"
          onEdit={() => onEdit("details")}
          editLabel="Edit your shop's details"
          badge={sample ? "Sample" : undefined}
          canEdit={!sample}
        >
          <Fact label="Name">{shop.name}</Fact>
          <Fact label="Website">
            {shop.website ? displayUrl(shop.website) : <Missing>Not added</Missing>}
          </Fact>
          <Fact label="Currency">{CURRENCY_LABELS[shop.currency]}</Fact>
          <Fact label="Time zone">{zoneLabel(shop.timeZone)}</Fact>
          <Fact label="What you sell">{shop.sells}</Fact>
        </Section>

        <Section
          title="PayPal"
          onEdit={() => onEdit("paypal")}
          editLabel="Change the PayPal connection"
          canEdit={!sample}
        >
          {sample ? (
            <Fact label="Connection">Simulated in the sample shop</Fact>
          ) : shop.paypal ? (
            <>
              <Fact label="App">
                <span className="inline-flex flex-wrap items-center gap-2">
                  <EnvironmentChip environment={shop.paypal.environment} />
                  <code className="font-mono text-xs">{shortKey(shop.paypal.clientId)}</code>
                </span>
              </Fact>
              <Fact label="Truce can use">
                <ul className="flex flex-wrap gap-x-3 gap-y-1">
                  {PAYPAL_FEATURES.map((feature) => {
                    const paypal = shop.paypal;
                    const on = paypal ? featureOn(paypal, feature.key) : false;
                    // A webhook skipped because the site isn't public yet is expected, not a fault.
                    const waiting =
                      !on && feature.key === "webhooks" && paypal?.webhook.status === "skipped";
                    return (
                      <li
                        key={feature.key}
                        className={cn(
                          "inline-flex items-center gap-1",
                          on
                            ? "text-ink"
                            : waiting
                              ? "text-ink-2"
                              : "text-ink-3 line-through decoration-current/40",
                        )}
                      >
                        {on ? (
                          <Check aria-hidden className="text-moss size-3.5" strokeWidth={2.5} />
                        ) : waiting ? (
                          <Minus aria-hidden className="text-ink-3 size-3.5" strokeWidth={2.5} />
                        ) : (
                          <TriangleAlert aria-hidden className="text-warn-700 size-3.5" />
                        )}
                        <span className="sr-only">
                          {on ? "On:" : waiting ? "Not registered yet:" : "Off:"}
                        </span>
                        {feature.label}
                      </li>
                    );
                  })}
                </ul>
              </Fact>
            </>
          ) : (
            <Fact label="Connection">
              <Missing tone="risk">Not connected yet</Missing>
            </Fact>
          )}
        </Section>

        <Section
          title="Policies"
          onEdit={() => onEdit("policies")}
          editLabel="Edit your policies"
          canEdit={!sample}
        >
          <Fact label="Shipping">
            <PolicySummary policy={shop.policies.shipping} />
          </Fact>
          <Fact label="Returns">
            <PolicySummary policy={shop.policies.returns} />
          </Fact>
        </Section>

        <Section
          title="Notifications"
          onEdit={() => onEdit("notifications")}
          editLabel="Edit your notifications"
        >
          <Fact label="In the app">{notificationSummary(prefs)}</Fact>
          <Fact label="Email">{prefs.email ? "On, once email delivery opens" : "Off"}</Fact>
        </Section>

        <div className="bg-mist/60 rounded-card border-mist-line flex gap-3 border px-4 py-3.5">
          <RefreshCw aria-hidden className="text-moss-deep mt-0.5 size-4 shrink-0" />
          <p className="text-ink-2 text-[13px] leading-5 text-pretty">
            {sample
              ? "The first sync loads Wick & Ember's disputes and orders, sorts them by deadline and analyzes the most urgent case. It takes under a minute."
              : "The first sync reads your disputes and their orders from PayPal, sorts them by deadline and analyzes the most urgent case. It takes about a minute."}
          </p>
        </div>
      </div>
    </StepFrame>
  );
}

function Section({
  title,
  badge,
  onEdit,
  editLabel,
  canEdit = true,
  children,
}: {
  title: string;
  badge?: string;
  /** Leave it out for a section with nothing to edit here. */
  onEdit?: () => void;
  editLabel?: string;
  canEdit?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border-line border px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-ink flex items-center gap-2 text-[15px] font-semibold">
          {title}
          {badge && (
            <Chip tone="outline" size="sm">
              {badge}
            </Chip>
          )}
        </h2>
        {canEdit && onEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            aria-label={editLabel}
            className="-mr-2"
          >
            Edit
          </Button>
        )}
      </div>
      <dl className="mt-2.5 space-y-2">{children}</dl>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 text-sm sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-ink min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Missing({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "risk";
}) {
  return <span className={tone === "risk" ? "text-risk-700" : "text-ink-3"}>{children}</span>;
}

function PolicySummary({ policy }: { policy: PolicySource }) {
  const text = policy.text.trim();
  if (!policy.url && !text) {
    return <Missing>Not added yet, so Truce won&rsquo;t quote one</Missing>;
  }
  return (
    <span className="flex flex-col gap-0.5">
      {policy.url && <span className="break-words">{displayUrl(policy.url)}</span>}
      {text && (
        <span className={policy.url ? "text-ink-2 text-[13px]" : undefined}>
          Pasted text, {count.format(text.length)} characters
        </span>
      )}
    </span>
  );
}
