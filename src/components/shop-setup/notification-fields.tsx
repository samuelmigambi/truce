"use client";

import type { ReactNode } from "react";
import type { NotificationPrefs } from "@/lib/domain";
import { Chip } from "../ui/chip";
import { cn } from "../ui/cn";
import { RadioSegments } from "../ui/radio-group";
import { Switch } from "../ui/switch";
import { fieldId } from "./fields";

type Toggle = "newDisputes" | "buyerReplies" | "deadlines" | "decisions";

const TOGGLES: { key: Toggle; title: string; about: string }[] = [
  {
    key: "newDisputes",
    title: "New disputes",
    about: "When a buyer opens a dispute, or PayPal moves one to a claim.",
  },
  {
    key: "buyerReplies",
    title: "Buyer replies",
    about: "When a buyer answers a message or an offer.",
  },
  {
    key: "deadlines",
    title: "Deadlines",
    about: "Before PayPal's window to respond closes.",
  },
  {
    key: "decisions",
    title: "PayPal decisions",
    about: "When PayPal decides a claim, either way.",
  },
];

const DAYS: NotificationPrefs["deadlineDays"][] = [1, 2, 3, 5];

/**
 * What Truce tells the seller about. Every choice is the signed-in member's own. In-app
 * notifications work now; email is saved for when delivery opens, and says so.
 */
export function NotificationFields({
  value,
  onChange,
  disabled = false,
  idPrefix = "notify",
}: {
  value: NotificationPrefs;
  onChange: (value: NotificationPrefs) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const set = <K extends keyof NotificationPrefs>(key: K, next: NotificationPrefs[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="space-y-4">
      <ul className="rounded-card border-line divide-line-soft divide-y border">
        {TOGGLES.map((toggle) => (
          <li key={toggle.key} className="px-4 py-3.5 sm:px-5">
            <SwitchRow
              id={fieldId(idPrefix, toggle.key)}
              title={toggle.title}
              about={toggle.about}
              checked={value[toggle.key]}
              onChange={(next) => set(toggle.key, next)}
              disabled={disabled}
            />
            {toggle.key === "deadlines" && (
              <div
                className={cn(
                  "mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 transition-opacity duration-150",
                  !value.deadlines && "opacity-50",
                )}
              >
                <span aria-hidden className="text-ink-2 text-[13px]">
                  Remind me
                </span>
                <RadioSegments
                  size="sm"
                  label="Remind me this many days before it's due"
                  value={String(value.deadlineDays)}
                  onChange={(days) =>
                    set("deadlineDays", Number(days) as NotificationPrefs["deadlineDays"])
                  }
                  disabled={disabled || !value.deadlines}
                  options={DAYS.map((days) => ({
                    value: String(days),
                    label: (
                      <>
                        {days}
                        <span className="sr-only">{days === 1 ? " day" : " days"}</span>
                      </>
                    ),
                  }))}
                />
                <span aria-hidden className="text-ink-2 text-[13px]">
                  days before it&rsquo;s due
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="rounded-card border-line-strong border border-dashed px-4 py-3.5 sm:px-5">
        <SwitchRow
          id={fieldId(idPrefix, "email")}
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              Email me too
              <Chip tone="outline" size="sm">
                Coming soon
              </Chip>
            </span>
          }
          about="Email delivery is coming soon. Your choice is saved, and in-app notifications work now."
          checked={value.email}
          onChange={(next) => set("email", next)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function SwitchRow({
  id,
  title,
  about,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  title: ReactNode;
  about: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
}) {
  const aboutId = `${id}-about`;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label
          htmlFor={id}
          className={cn("text-ink block text-sm font-medium", !disabled && "cursor-pointer")}
        >
          {title}
        </label>
        <p id={aboutId} className="text-ink-2 mt-0.5 text-[13px] leading-5 text-pretty">
          {about}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-describedby={aboutId}
        className="mt-0.5"
      />
    </div>
  );
}
