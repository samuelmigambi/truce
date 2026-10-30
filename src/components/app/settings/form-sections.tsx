"use client";

import { useState } from "react";
import type { NotificationPrefs, Shop, ShopPolicies, ShopProfile } from "@/lib/domain";
import { updateShop } from "@/lib/client/actions";
import { errorMessage, fieldErrors } from "@/lib/client/api";
import { useMe, useShop } from "@/lib/client/shop-context";
import { DEFAULT_NOTIFICATIONS } from "@/lib/shop-options";
import {
  checkPolicies,
  checkProfile,
  fieldsUnder,
  focusFirstError,
  NotificationFields,
  POLICY_FIELDS,
  PROFILE_FIELDS,
  ShopPolicyFields,
  ShopProfileFields,
  type ProfileErrors,
} from "../../shop-setup";
import { useToast } from "../../ui/toast";
import { SaveBar, SettingsSection, useUnsavedWarning } from "./section";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A section's form: the value being edited, and the saved value it started from. When the saved
 * value changes elsewhere (another tab, onboarding) and nothing here is edited, the form follows.
 */
function useSectionForm<T>(saved: T) {
  const [value, setValue] = useState(saved);
  const [baseline, setBaseline] = useState(saved);
  const [seen, setSeen] = useState(saved);
  if (!same(saved, seen)) {
    setSeen(saved);
    if (same(value, baseline)) setValue(saved);
    setBaseline(saved);
  }
  const dirty = !same(value, baseline);
  useUnsavedWarning(dirty);
  return {
    value,
    setValue,
    dirty,
    discard: () => setValue(baseline),
    /** After a save, the server's copy (normalized, such as a full web address) is the start. */
    settle: (next: T) => {
      setValue(next);
      setBaseline(next);
      setSeen(next);
    },
  };
}

/** The keys whose values differ between two flat-ish objects, as "a" or "a.b". */
function changedKeys(before: object, after: object, prefix = ""): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: string[] = [];
  for (const key of keys) {
    const a = (before as Record<string, unknown>)[key];
    const b = (after as Record<string, unknown>)[key];
    if (a && b && typeof a === "object" && typeof b === "object") {
      out.push(...changedKeys(a, b, `${prefix}${key}.`));
    } else if (a !== b) out.push(`${prefix}${key}`);
  }
  return out;
}

function clearChanged<E extends Record<string, string | undefined>>(
  errors: E,
  before: object,
  after: object,
): E {
  const changed = changedKeys(before, after).filter((key) => errors[key]);
  if (!changed.length) return errors;
  const next = { ...errors };
  for (const key of changed) delete next[key];
  return next;
}

function profileOf(shop: Shop): ShopProfile {
  return {
    name: shop.name,
    website: shop.website,
    currency: shop.currency,
    timeZone: shop.timeZone,
    sells: shop.sells,
  };
}

const PROFILE_PREFIX = "settings-shop";

/** The shop's name, site, currency, time zone and what it sells. */
export function ShopSection() {
  const shop = useShop();
  const toast = useToast();
  const form = useSectionForm(profileOf(shop));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    const checked = checkProfile(form.value);
    if (!checked.ok) {
      setErrors(checked.errors);
      focusFirstError(PROFILE_PREFIX, PROFILE_FIELDS, checked.errors);
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const response = await updateShop(shop.id, { profile: checked.profile });
      form.settle(profileOf(response.shop));
      toast({
        title: "Shop details saved",
        description: "Truce uses them from the next analysis on.",
      });
    } catch (e) {
      const fields = fieldsUnder(fieldErrors(e), "profile") as ProfileErrors;
      if (Object.keys(fields).length) {
        setErrors(fields);
        focusFirstError(PROFILE_PREFIX, PROFILE_FIELDS, fields);
      } else {
        toast({
          title: "Couldn't save the shop details",
          description: errorMessage(e),
          tone: "error",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection
      id="shop"
      title="Shop"
      description="The agent uses every one of these: in the replies it drafts, the listings it reads and the deadlines it counts."
      onSubmit={save}
      footer={
        <SaveBar
          dirty={form.dirty}
          saving={saving}
          onDiscard={() => {
            form.discard();
            setErrors({});
          }}
          note="Dates and amounts across the app follow these"
        />
      }
    >
      <ShopProfileFields
        value={form.value}
        onChange={(next) => {
          setErrors((current) => clearChanged(current, form.value, next));
          form.setValue(next);
        }}
        errors={errors}
        disabled={saving}
        idPrefix={PROFILE_PREFIX}
      />
    </SettingsSection>
  );
}

const POLICY_PREFIX = "settings-policy";

/** Shipping and returns, as Truce quotes them to buyers and PayPal. */
export function PoliciesSection() {
  const shop = useShop();
  const toast = useToast();
  const form = useSectionForm<ShopPolicies>(shop.policies);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    const checked = checkPolicies(form.value);
    if (!checked.ok) {
      setErrors(checked.errors);
      focusFirstError(POLICY_PREFIX, POLICY_FIELDS, checked.errors);
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const response = await updateShop(shop.id, { policies: checked.policies });
      form.settle(response.shop.policies);
      toast({ title: "Policies saved", description: "Truce quotes them from the next case on." });
    } catch (e) {
      const fields = fieldsUnder(fieldErrors(e), "policies");
      if (Object.keys(fields).length) {
        setErrors(fields);
        focusFirstError(POLICY_PREFIX, POLICY_FIELDS, fields);
      } else {
        toast({ title: "Couldn't save the policies", description: errorMessage(e), tone: "error" });
      }
    } finally {
      setSaving(false);
    }
  }

  // The sample shop's policies are part of its sample data: shown as they are, with nothing to save.
  const sample = shop.kind === "sample";

  return (
    <SettingsSection
      id="policies"
      title="Policies"
      description={
        sample
          ? "Wick & Ember's own, as its storefront publishes them. Truce cites them word for word."
          : "Truce cites these word for word when it answers a buyer or sends PayPal evidence."
      }
      onSubmit={sample ? undefined : save}
      footer={
        sample ? undefined : (
          <SaveBar
            dirty={form.dirty}
            saving={saving}
            onDiscard={() => {
              form.discard();
              setErrors({});
            }}
            note="A link keeps them current; pasted text is quoted as is"
          />
        )
      }
    >
      <ShopPolicyFields
        value={form.value}
        onChange={(next) => {
          setErrors((current) => clearChanged(current, form.value, next));
          form.setValue(next);
        }}
        errors={errors}
        disabled={saving}
        readOnly={sample}
        idPrefix={POLICY_PREFIX}
      />
    </SettingsSection>
  );
}

/** The signed-in member's own notification choices in this shop. */
export function NotificationsSection() {
  const shop = useShop();
  const { user } = useMe();
  const toast = useToast();
  const mine: NotificationPrefs = shop.members[user.uid]?.notifications ?? DEFAULT_NOTIFICATIONS;
  const form = useSectionForm(mine);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const response = await updateShop(shop.id, { notifications: form.value });
      form.settle(response.shop.members[user.uid]?.notifications ?? form.value);
      toast({ title: "Notifications saved", description: "They apply to you only, in this shop." });
    } catch (e) {
      toast({ title: "Couldn't save notifications", description: errorMessage(e), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection
      id="notifications"
      title="Notifications"
      description="What Truce tells you about in this shop. Each person in the shop chooses their own."
      onSubmit={save}
      footer={
        <SaveBar
          dirty={form.dirty}
          saving={saving}
          onDiscard={form.discard}
          note="They show under the bell, at the top of the app"
        />
      }
    >
      <NotificationFields
        value={form.value}
        onChange={form.setValue}
        disabled={saving}
        idPrefix="settings-notify"
      />
    </SettingsSection>
  );
}
