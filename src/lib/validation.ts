import { z } from "zod";
import { CURRENCIES, type CurrencyCode } from "./domain";

/**
 * The rules for everything a person types into Truce, in one place: the browser checks a form
 * with these before it's sent, and the API routes check the same body again, so the two can
 * never disagree.
 */

/** Whether the runtime knows this IANA time zone. */
export function isTimeZone(zone: string): boolean {
  if (!zone || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(0);
    return true;
  } catch {
    return false;
  }
}

/**
 * "wickandember.com" → "https://wickandember.com". Only http and https, never credentials in
 * the address; a trailing slash on the bare origin is dropped.
 */
export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const bareName = !url.hostname.includes(".") && url.hostname !== "localhost";
  if (url.username || url.password || bareName) return null;
  url.hash = "";
  const text = url.toString();
  return url.pathname === "/" && !url.search ? text.replace(/\/$/, "") : text;
}

const optionalUrl = (what: string) =>
  z
    .string()
    .trim()
    .max(300, `Keep the ${what} address under 300 characters.`)
    .transform((value, ctx) => {
      if (!value) return null;
      const url = normalizeUrl(value);
      if (!url) {
        ctx.addIssue({ code: "custom", message: `That doesn't look like a web address.` });
        return z.NEVER;
      }
      return url;
    });

export const personNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(60, "Keep your name under 60 characters.");

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(254, "That email address is too long.")
  .pipe(z.email("That doesn't look like an email address."));

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(128, "Keep it under 128 characters.");

export const shopProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your shop's name.")
    .max(60, "Keep the name under 60 characters."),
  website: z
    .string()
    .nullable()
    .transform((value) => value ?? "")
    .pipe(optionalUrl("website")),
  currency: z.enum(CURRENCIES as readonly [CurrencyCode, ...CurrencyCode[]], {
    error: "Choose a currency.",
  }),
  timeZone: z.string().trim().refine(isTimeZone, "Choose your shop's time zone."),
  sells: z
    .string()
    .trim()
    .min(2, "Say in a few words what you sell.")
    .max(120, "Keep it under 120 characters."),
});

const policySchema = z.object({
  text: z.string().trim().max(6000, "Keep the policy under 6,000 characters."),
  url: z
    .string()
    .nullable()
    .transform((value) => value ?? "")
    .pipe(optionalUrl("policy")),
});

export const shopPoliciesSchema = z.object({
  shipping: policySchema,
  returns: policySchema,
});

export const notificationPrefsSchema = z.object({
  newDisputes: z.boolean(),
  buyerReplies: z.boolean(),
  deadlines: z.boolean(),
  deadlineDays: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5)]),
  decisions: z.boolean(),
  email: z.boolean(),
});

/** PayPal's client IDs and secrets are long runs of letters, digits, dashes and underscores. */
const paypalKey = (what: string) =>
  z
    .string()
    .trim()
    .min(1, `Paste the app's ${what}.`)
    .max(200, `That's longer than a PayPal ${what}.`)
    .regex(/^[A-Za-z0-9_-]{20,200}$/, `That doesn't look like a PayPal ${what}. Copy it again.`);

export const connectPayPalSchema = z.object({
  environment: z.enum(["sandbox", "live"], { error: "Choose sandbox or live." }),
  clientId: paypalKey("client ID"),
  clientSecret: paypalKey("secret"),
});

/** zod's issues as `{ "path.to.field": "message" }`, the first message for each field. */
export function issuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return fields;
}
