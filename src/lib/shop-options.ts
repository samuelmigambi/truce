import { SHOP } from "./catalog";
import type { CurrencyCode, NotificationPrefs, ShopPolicies, ShopProfile } from "./domain";

/** Choices and starting values for the shop forms, shared by onboarding, settings and the server. */

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  USD: "US dollar (USD)",
  CAD: "Canadian dollar (CAD)",
  AUD: "Australian dollar (AUD)",
  GBP: "British pound (GBP)",
  EUR: "Euro (EUR)",
};

/** Common shop time zones, west to east; the browser's own zone is offered too if it's missing. */
export const TIME_ZONES: { value: string; label: string }[] = [
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "America/Los_Angeles", label: "Pacific time (Los Angeles)" },
  { value: "America/Denver", label: "Mountain time (Denver)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "America/Chicago", label: "Central time (Chicago)" },
  { value: "America/New_York", label: "Eastern time (New York)" },
  { value: "America/Halifax", label: "Atlantic time (Halifax)" },
  { value: "America/Toronto", label: "Toronto" },
  { value: "America/Vancouver", label: "Vancouver" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Dublin", label: "Dublin" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Africa/Kigali", label: "Kigali" },
  { value: "Africa/Johannesburg", label: "Johannesburg" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Australia/Perth", label: "Perth" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "Pacific/Auckland", label: "Auckland" },
];

export const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  newDisputes: true,
  buyerReplies: true,
  deadlines: true,
  deadlineDays: 2,
  decisions: true,
  email: false,
};

export const EMPTY_POLICIES: ShopPolicies = {
  shipping: { text: "", url: null },
  returns: { text: "", url: null },
};

/** A blank profile for a new shop, in the browser's own time zone. */
/** The sample shop's details: as the server makes it, and as onboarding shows it beforehand. */
export function sampleProfile(website: string | null): ShopProfile {
  return {
    name: SHOP.name,
    website,
    currency: "USD",
    timeZone: "America/Los_Angeles",
    sells: "Hand-poured candles, gift boxes and candle tools",
  };
}

export function emptyProfile(timeZone = "America/New_York"): ShopProfile {
  return { name: "", website: null, currency: "USD", timeZone, sells: "" };
}

/** The time zone this browser is in, or New York when it can't say. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}
