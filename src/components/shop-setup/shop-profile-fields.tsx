"use client";

import { CURRENCIES, type ShopProfile } from "@/lib/domain";
import { CURRENCY_LABELS, TIME_ZONES } from "@/lib/shop-options";
import { Input } from "../ui/field";
import { FormField } from "../ui/form-field";
import { Select } from "../ui/select";
import { fieldId, useBrowserTimeZone, zoneCity, type ProfileErrors } from "./fields";

/** The zones to offer: the common ones, plus the browser's own and the saved one when missing. */
function zoneOptions(current: string, browser: string | null): { value: string; label: string }[] {
  const options = [...TIME_ZONES];
  const known = new Set(options.map((zone) => zone.value));
  if (browser && !known.has(browser)) {
    options.unshift({ value: browser, label: `${zoneCity(browser)} (this device)` });
    known.add(browser);
  }
  if (current && !known.has(current)) options.unshift({ value: current, label: zoneCity(current) });
  return options;
}

/**
 * The shop's details: its name, public site, currency, time zone and what it sells. The agent
 * uses every one of them. Onboarding and Settings share it.
 */
export function ShopProfileFields({
  value,
  onChange,
  errors = {},
  disabled = false,
  readOnly = false,
  idPrefix = "shop",
}: {
  value: ShopProfile;
  onChange: (value: ShopProfile) => void;
  errors?: ProfileErrors;
  disabled?: boolean;
  /** Shows the details as fixed values, such as the sample shop's. */
  readOnly?: boolean;
  idPrefix?: string;
}) {
  const fixed = readOnly ? "bg-cream text-ink-2 hover:border-line hover:shadow-none" : undefined;
  const browserZone = useBrowserTimeZone();
  const zones = zoneOptions(value.timeZone, browserZone);
  const id = (key: keyof ShopProfile) => fieldId(idPrefix, key);
  const set = <K extends keyof ShopProfile>(key: K, next: ShopProfile[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
      <FormField id={id("name")} label="Shop name" error={errors.name} className="sm:col-span-2">
        {(control) => (
          <Input
            {...control}
            value={value.name}
            onChange={(event) => set("name", event.target.value)}
            disabled={disabled}
            readOnly={readOnly}
            className={fixed}
            autoComplete="organization"
            maxLength={60}
            placeholder="Maple & Moss Candles"
          />
        )}
      </FormField>

      <FormField
        id={id("website")}
        label="Website"
        optional
        error={errors.website}
        hint="Must be public, so Truce can read your products and policies."
        className="sm:col-span-2"
      >
        {(control) => (
          <Input
            {...control}
            value={value.website ?? ""}
            onChange={(event) => set("website", event.target.value ? event.target.value : null)}
            disabled={disabled}
            readOnly={readOnly}
            className={fixed}
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={300}
            placeholder="yourshop.com"
          />
        )}
      </FormField>

      <FormField id={id("currency")} label="Currency" error={errors.currency}>
        {(control) => (
          <Select
            {...control}
            value={value.currency}
            onChange={(next) => set("currency", next)}
            options={CURRENCIES.map((code) => ({ value: code, label: CURRENCY_LABELS[code] }))}
            searchPlaceholder="Search currencies"
            disabled={disabled}
            readOnly={readOnly}
          />
        )}
      </FormField>

      <FormField id={id("timeZone")} label="Time zone" error={errors.timeZone}>
        {(control) => (
          <Select
            {...control}
            value={value.timeZone}
            onChange={(next) => set("timeZone", next)}
            options={zones}
            searchPlaceholder="Search time zones"
            disabled={disabled}
            readOnly={readOnly}
          />
        )}
      </FormField>

      <FormField
        id={id("sells")}
        label="What you sell"
        error={errors.sells}
        className="sm:col-span-2"
      >
        {(control) => (
          <Input
            {...control}
            value={value.sells}
            onChange={(event) => set("sells", event.target.value)}
            disabled={disabled}
            readOnly={readOnly}
            className={fixed}
            maxLength={120}
            placeholder="Hand-poured soy candles"
          />
        )}
      </FormField>
    </div>
  );
}
