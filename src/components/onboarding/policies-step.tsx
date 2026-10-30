"use client";

import { ArrowUpRight, Quote } from "lucide-react";
import { useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import type { ShopResponse } from "@/lib/api-types";
import { errorMessage, fieldErrors, patchJson, shopApi } from "@/lib/client/api";
import type { PolicySource, Shop, ShopPolicies } from "@/lib/domain";
import { Button } from "../ui/button";
import { Chip } from "../ui/chip";
import { useToast } from "../ui/toast";
import {
  checkPolicies,
  fieldsUnder,
  focusFirstError,
  POLICY_FIELDS,
  ShopPolicyFields,
  without,
} from "../shop-setup";
import { StepFooter, StepFrame, type StepBase } from "./step-frame";
import { shopReached } from "./steps";

const PREFIX = "policy";

/** One policy field's value by its path, such as "returns.url". */
function valueAt(policies: ShopPolicies, key: (typeof POLICY_FIELDS)[number]): string {
  const [policy, part] = key.split(".") as [keyof ShopPolicies, keyof PolicySource];
  return policies[policy][part] ?? "";
}

/**
 * Step 4: the shipping and returns policies. Optional, but Truce quotes them to buyers word for
 * word, so the step says why they're worth adding. A sample shop shows its own, read-only.
 */
export function PoliciesStep({
  shop,
  onUpdated,
  onNext,
  ...base
}: StepBase & {
  shop: Shop;
  onUpdated: (shop: Shop) => void;
  onNext: () => void;
}) {
  const [policies, setPolicies] = useState(shop.policies);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const sample = shop.kind === "sample";
  const empty = POLICY_FIELDS.every((key) => !valueAt(policies, key).trim());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (sample) {
      await move(() =>
        shopReached(shop, "notifications")
          ? Promise.resolve(null)
          : patchJson<ShopResponse>(shopApi(shop.id), { setupStep: "notifications" }),
      );
      return;
    }
    const checked = checkPolicies(policies);
    if (!checked.ok) {
      setErrors(checked.errors);
      focusFirstError(PREFIX, POLICY_FIELDS, checked.errors);
      return;
    }
    setErrors({});
    await move(() =>
      patchJson<ShopResponse>(shopApi(shop.id), {
        policies: checked.policies,
        setupStep: "notifications",
      }),
    );
  }

  /** Saves, then moves on; on failure, shows why next to the field or above the footer. */
  async function move(save: () => Promise<ShopResponse | null>) {
    setSaving(true);
    try {
      const response = await save();
      if (response) onUpdated(response.shop);
      onNext();
    } catch (problem) {
      const fields = fieldsUnder(fieldErrors(problem), "policies");
      const hasFields = Object.keys(fields).length > 0;
      flushSync(() => {
        setSaving(false);
        if (hasFields) setErrors(fields);
        else toast({ key: "onboarding", tone: "error", title: errorMessage(problem) });
      });
      if (hasFields) focusFirstError(PREFIX, POLICY_FIELDS, fields);
    }
  }

  return (
    <StepFrame
      {...base}
      title={sample ? "The sample shop's policies" : "Add your shipping and returns policies"}
      description={
        sample
          ? "Truce quotes these word for word when it answers Wick & Ember's buyers."
          : "Optional, but recommended. Truce quotes them word for word in its replies, so they always match what your shop promised."
      }
      onSubmit={submit}
      footer={
        <StepFooter
          onBack={base.onBack}
          note={!sample && empty ? "You can add them later in Settings" : undefined}
        >
          <Button type="submit" loading={saving}>
            {!sample && empty ? "Skip for now" : "Continue"}
          </Button>
        </StepFooter>
      }
    >
      {sample ? (
        <div className="space-y-4">
          <PolicyPreview title="Shipping" policy={shop.policies.shipping} />
          <PolicyPreview title="Returns and refunds" policy={shop.policies.returns} />
        </div>
      ) : (
        <ShopPolicyFields
          value={policies}
          onChange={(next) => {
            setPolicies(next);
            const changed = POLICY_FIELDS.find(
              (key) => errors[key] && valueAt(next, key) !== valueAt(policies, key),
            );
            if (changed) setErrors((current) => without(current, changed));
          }}
          errors={errors}
          disabled={saving}
          idPrefix={PREFIX}
        />
      )}
    </StepFrame>
  );
}

/** A sample policy, read-only, the way Truce will quote it. */
function PolicyPreview({ title, policy }: { title: string; policy: PolicySource }) {
  return (
    <div className="rounded-card border-line border p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink flex items-center gap-2 text-[15px] font-semibold">
          {title}
          <Chip tone="outline" size="sm">
            Sample
          </Chip>
        </p>
        {policy.url && (
          <a
            href={policy.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-moss-deep inline-flex items-center gap-1 text-[13px] font-medium hover:underline"
          >
            The published page
            <ArrowUpRight aria-hidden className="size-3.5" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </div>
      {policy.text ? (
        <blockquote className="bg-cream text-ink-2 relative mt-3 rounded-[10px] py-3 pr-3.5 pl-9 text-[13px] leading-relaxed whitespace-pre-wrap">
          <Quote aria-hidden className="text-moss/60 absolute top-3 left-3 size-3.5" />
          {policy.text}
        </blockquote>
      ) : (
        <p className="text-ink-3 mt-2 text-[13px]">No text pasted; Truce reads the page.</p>
      )}
    </div>
  );
}
