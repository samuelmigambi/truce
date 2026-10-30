"use client";

import { Flame, Store, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import type { ShopResponse, ShopSummary } from "@/lib/api-types";
import {
  deleteJson,
  errorMessage,
  fieldErrors,
  patchJson,
  postJson,
  shopApi,
} from "@/lib/client/api";
import type { Shop, ShopProfile, ShopRole } from "@/lib/domain";
import { emptyProfile, sampleProfile } from "@/lib/shop-options";
import { Button } from "../ui/button";
import { Chip } from "../ui/chip";
import { Dialog } from "../ui/overlay";
import { RadioCards } from "../ui/radio-group";
import { useToast } from "../ui/toast";
import {
  checkProfile,
  fieldsUnder,
  focusFirstError,
  PROFILE_FIELDS,
  ShopProfileFields,
  type ProfileErrors,
} from "../shop-setup";
import { useBrowserTimeZone } from "../shop-setup/fields";
import { focusStepHeading, StepFooter, StepFrame, type StepBase } from "./step-frame";
import { resumeHref, shopReached } from "./steps";

type Mode = "own" | "sample";

const PREFIX = "shop";

function profileOf(shop: Shop | null): ShopProfile {
  if (!shop || shop.kind !== "real") return { ...emptyProfile(), timeZone: "" };
  return {
    name: shop.name,
    website: shop.website,
    currency: shop.currency,
    timeZone: shop.timeZone,
    sells: shop.sells,
  };
}

/** The sample shop's details: the saved ones once it exists, and before that what it will have. */
function sampleDetails(sample: Shop | null): ShopProfile {
  if (sample) {
    return {
      name: sample.name,
      website: sample.website,
      currency: sample.currency,
      timeZone: sample.timeZone,
      sells: sample.sells,
    };
  }
  return sampleProfile(`${window.location.origin}/shop`);
}

/**
 * Step 2: the shop. Either the seller's own, from its details, or the Wick & Ember sample shop
 * to explore first. A draft that's no longer wanted can be deleted from here.
 */
export function ShopStep({
  shop,
  shops,
  onCreated,
  onUpdated,
  onDeleted,
  onNext,
  ...base
}: StepBase & {
  shop: Shop | null;
  shops: ShopSummary[];
  onCreated: (shop: Shop, role: ShopRole) => void;
  onUpdated: (shop: Shop) => void;
  onDeleted: (shopId: string) => void;
  onNext: () => void;
}) {
  const toast = useToast();
  const browserZone = useBrowserTimeZone();
  const [mode, setMode] = useState<Mode>(shop?.kind === "sample" ? "sample" : "own");
  const [profile, setProfile] = useState<ShopProfile>(() => profileOf(shop));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Until the seller picks one, the shop's zone is the browser's own.
  const value: ShopProfile = {
    ...profile,
    timeZone: profile.timeZone || browserZone || "America/New_York",
  };
  const draft = shop?.kind === "real" ? shop : null;
  const sample = shop?.kind === "sample" ? shop : null;
  const others = shops.filter((s) => s.status === "setup" && s.id !== shop?.id);
  const startedSample = sample ? undefined : others.find((s) => s.kind === "sample");

  function change(next: ShopProfile) {
    setProfile(next);
    if (Object.keys(errors).length) {
      setErrors((current) => {
        const kept: ProfileErrors = {};
        for (const key of PROFILE_FIELDS) {
          if (current[key] && next[key] === value[key]) kept[key] = current[key];
        }
        return kept;
      });
    }
  }

  /** Makes sure the shop's saved step has reached PayPal before moving on. */
  async function reachPayPal(target: Shop): Promise<Shop> {
    if (shopReached(target, "paypal")) return target;
    const response = await patchJson<ShopResponse>(shopApi(target.id), { setupStep: "paypal" });
    return response.shop;
  }

  /** Saves the step. Resolves to true when the page is about to load another address. */
  async function save(profile: ShopProfile | null): Promise<boolean> {
    if (!profile) {
      if (sample) {
        onUpdated(await reachPayPal(sample));
      } else if (startedSample) {
        // Pick up the sample shop already started instead of making a second one.
        window.location.assign(resumeHref(startedSample.id));
        return true;
      } else {
        const created = await postJson<ShopResponse>("/api/shops", { kind: "sample" });
        onCreated(created.shop, created.role);
        onUpdated(await reachPayPal(created.shop));
      }
    } else if (draft) {
      const updated = await patchJson<ShopResponse>(shopApi(draft.id), {
        profile,
        setupStep: "paypal",
      });
      onUpdated(updated.shop);
    } else {
      const created = await postJson<ShopResponse>("/api/shops", { kind: "real", profile });
      // The flow learns about the new draft at once, so a retry updates it instead of making another.
      onCreated(created.shop, created.role);
      onUpdated(await reachPayPal(created.shop));
    }
    onNext();
    return false;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    let profile: ShopProfile | null = null;
    if (mode === "own") {
      const checked = checkProfile(value);
      if (!checked.ok) {
        setErrors(checked.errors);
        focusFirstError(PREFIX, PROFILE_FIELDS, checked.errors);
        return;
      }
      setErrors({});
      profile = checked.profile;
    }
    setSaving(true);
    try {
      const leaving = await save(profile);
      if (!leaving) setSaving(false);
    } catch (problem) {
      const fields = fieldsUnder(fieldErrors(problem), "profile") as ProfileErrors;
      const hasFields = mode === "own" && PROFILE_FIELDS.some((key) => fields[key]);
      flushSync(() => {
        setSaving(false);
        if (hasFields) setErrors(fields);
        else toast({ key: "onboarding", tone: "error", title: errorMessage(problem) });
      });
      if (hasFields) focusFirstError(PREFIX, PROFILE_FIELDS, fields);
    }
  }

  async function remove() {
    if (!shop || deleting) return;
    setDeleting(true);
    try {
      await deleteJson(shopApi(shop.id));
      setConfirming(false);
      onDeleted(shop.id);
      setProfile(profileOf(null));
      setMode("own");
      focusStepHeading();
      toast({
        title: sample ? "Sample shop deleted" : "Draft deleted",
        description: `${shop.name} and everything in it is gone.`,
      });
    } catch (problem) {
      toast({ title: "Couldn't delete it", description: errorMessage(problem), tone: "error" });
    } finally {
      setDeleting(false);
    }
  }

  const primary =
    mode === "sample" && !sample
      ? startedSample
        ? "Open the sample shop"
        : "Explore the sample shop"
      : "Continue";

  return (
    <StepFrame
      {...base}
      title="Tell Truce about your shop"
      description="Truce uses these details in every reply it drafts, so they should match what buyers see."
      onSubmit={submit}
      footer={
        <StepFooter onBack={base.onBack}>
          <Button type="submit" loading={saving}>
            {primary}
          </Button>
        </StepFooter>
      }
    >
      <div className="space-y-6">
        <RadioCards
          label="How do you want to start?"
          value={mode}
          onChange={(next) => {
            setMode(next);
          }}
          disabled={saving}
          options={[
            {
              value: "own",
              icon: <Store />,
              label: draft ? `Set up ${draft.name}` : "Set up your shop",
              description: "Connect your own PayPal. Everything is real.",
            },
            {
              value: "sample",
              icon: <Flame />,
              label: "Explore with a sample shop",
              description: "Wick & Ember's sample disputes. PayPal is simulated.",
            },
          ]}
        />

        {mode === "own" ? (
          <div key="own" className="animate-fade-rise">
            <ShopProfileFields
              value={value}
              onChange={change}
              errors={errors}
              disabled={saving}
              idPrefix={PREFIX}
            />
          </div>
        ) : (
          <div key="sample" className="animate-fade-rise space-y-4">
            <ShopProfileFields
              value={sampleDetails(sample)}
              onChange={() => undefined}
              readOnly
              idPrefix={`${PREFIX}-sample`}
            />
            {draft && (
              <p className="text-ink-2 text-[13px] leading-5">
                Your draft of {draft.name} stays saved, so you can come back to it.
              </p>
            )}
          </div>
        )}

        {others.length > 0 && <OtherDrafts shops={others} />}

        {shop && (mode === "sample" ? sample : draft) && (
          <div className="border-line-soft border-t pt-5">
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={saving}
              className="text-risk-700 inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium hover:underline disabled:opacity-50"
            >
              <Trash2 aria-hidden className="size-3.5" />
              {sample ? "Delete this sample shop" : "Delete this draft"}
            </button>
          </div>
        )}
      </div>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={sample ? "Delete the sample shop?" : "Delete this draft?"}
        description={
          shop
            ? `${shop.name} and everything saved in it so far is removed. This can't be undone.`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} data-autofocus>
              Keep it
            </Button>
            <Button variant="danger" onClick={remove} loading={deleting}>
              Delete
            </Button>
          </>
        }
      />
    </StepFrame>
  );
}

/** Other shops this person started setting up, to pick one up again. */
function OtherDrafts({ shops }: { shops: ShopSummary[] }) {
  return (
    <div className="rounded-card bg-cream/70 border-line-soft border px-4 py-3">
      <p className="text-ink-2 text-[13px]">
        {shops.length === 1 ? "You also have a shop in setup" : "You also have shops in setup"}
      </p>
      <ul className="mt-1.5 space-y-1">
        {shops.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span className="text-ink flex items-center gap-2 text-sm font-medium">
              {s.name}
              {s.kind === "sample" && (
                <Chip tone="outline" size="sm">
                  Sample
                </Chip>
              )}
            </span>
            {/* A full page load, so the server loads that shop's saved setup. */}
            <a
              href={resumeHref(s.id)}
              className="text-moss-deep text-[13px] font-medium hover:underline"
            >
              Continue setting it up
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
