"use client";

import { RotateCcw, Truck } from "lucide-react";
import type { ReactNode } from "react";
import type { PolicySource, ShopPolicies } from "@/lib/domain";
import { cn } from "../ui/cn";
import { Input, Textarea } from "../ui/field";
import { FormField } from "../ui/form-field";
import { fieldId } from "./fields";

const MAX_TEXT = 6000;
const count = new Intl.NumberFormat("en-US");

const POLICIES: {
  key: keyof ShopPolicies;
  title: string;
  about: string;
  icon: ReactNode;
  urlExample: string;
  textExample: string;
}[] = [
  {
    key: "shipping",
    title: "Shipping",
    about: "When orders ship, how they travel, and what happens if a parcel goes missing.",
    icon: <Truck />,
    urlExample: "yourshop.com/policies/shipping",
    textExample: "Orders ship within 2 business days by USPS Ground Advantage, with tracking…",
  },
  {
    key: "returns",
    title: "Returns and refunds",
    about: "What buyers can send back, within how long, and how you refund damaged items.",
    icon: <RotateCcw />,
    urlExample: "yourshop.com/policies/returns",
    textExample:
      "Unused items can be returned within 30 days. Damaged items are replaced or refunded…",
  },
];

/**
 * The shop's shipping and returns policies, each as a link to the published page, the pasted
 * text, or both. Truce quotes them word for word to buyers, so they're kept exactly as typed.
 */
export function ShopPolicyFields({
  value,
  onChange,
  errors = {},
  disabled = false,
  idPrefix = "policy",
}: {
  value: ShopPolicies;
  onChange: (value: ShopPolicies) => void;
  /** Keyed by the field's path: "shipping.url", "returns.text". */
  errors?: Record<string, string>;
  disabled?: boolean;
  idPrefix?: string;
}) {
  return (
    <div className="space-y-4">
      {POLICIES.map((policy) => (
        <PolicyGroup
          key={policy.key}
          policy={policy}
          value={value[policy.key]}
          onChange={(next) => onChange({ ...value, [policy.key]: next })}
          errors={errors}
          disabled={disabled}
          idPrefix={idPrefix}
        />
      ))}
    </div>
  );
}

function PolicyGroup({
  policy,
  value,
  onChange,
  errors,
  disabled,
  idPrefix,
}: {
  policy: (typeof POLICIES)[number];
  value: PolicySource;
  onChange: (value: PolicySource) => void;
  errors: Record<string, string>;
  disabled: boolean;
  idPrefix: string;
}) {
  const urlId = fieldId(idPrefix, `${policy.key}.url`);
  const textId = fieldId(idPrefix, `${policy.key}.text`);
  const legendId = `${fieldId(idPrefix, policy.key)}-legend`;
  const filled = Boolean(value.text.trim() || value.url);
  const near = value.text.length > MAX_TEXT * 0.9;

  return (
    <div
      role="group"
      aria-labelledby={legendId}
      className="rounded-card border-line min-w-0 border p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "rounded-btn flex size-9 shrink-0 items-center justify-center transition-colors duration-200 [&_svg]:size-[18px]",
            filled ? "bg-lemon text-ink" : "bg-mist text-moss-deep",
          )}
        >
          {policy.icon}
        </span>
        <div className="min-w-0">
          <p id={legendId} className="text-ink text-[15px] leading-5 font-semibold">
            {policy.title}
          </p>
          <p className="text-ink-2 mt-0.5 text-[13px] leading-5 text-pretty">{policy.about}</p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <FormField
          id={urlId}
          label="Link to the published page"
          error={errors[`${policy.key}.url`]}
        >
          {(control) => (
            <Input
              {...control}
              value={value.url ?? ""}
              onChange={(event) => onChange({ ...value, url: event.target.value || null })}
              disabled={disabled}
              inputMode="url"
              autoComplete="url"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={300}
              placeholder={policy.urlExample}
            />
          )}
        </FormField>

        <FormField
          id={textId}
          label="Or paste the text"
          error={errors[`${policy.key}.text`]}
          aside={
            <span
              className={cn(
                "text-xs tabular-nums",
                near ? "text-warn-700 font-medium" : "text-ink-3",
              )}
            >
              {count.format(value.text.length)} / {count.format(MAX_TEXT)}
            </span>
          }
        >
          {(control) => (
            <Textarea
              {...control}
              value={value.text}
              onChange={(event) => onChange({ ...value, text: event.target.value })}
              disabled={disabled}
              maxLength={MAX_TEXT}
              rows={4}
              placeholder={policy.textExample}
              className="max-h-80 min-h-28 resize-y"
            />
          )}
        </FormField>
      </div>
    </div>
  );
}
