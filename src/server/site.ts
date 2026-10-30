import "server-only";

/**
 * Whether this server can be reached from the internet: PayPal's webhooks and Tavily's page
 * reads need a public address, and local development isn't one.
 */

const PRIVATE_IPV4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^0\./,
];

/** Not this machine, a private network or a bare name. */
export function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host.includes(":")) return !(host === "::1" || /^(fc|fd|fe8|fe9|fea|feb)/.test(host));
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return !PRIVATE_IPV4.some((range) => range.test(host));
  if (!host.includes(".")) return false;
  return !/\.(localhost|local|internal|lan|home|test|example)$/.test(host);
}

/** SITE_URL's origin when it's public, or null (local development, or unset). */
export function publicOrigin(
  siteUrl: string | null | undefined = process.env.SITE_URL,
): string | null {
  if (!siteUrl) return null;
  try {
    const url = new URL(siteUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return isPublicHost(url.hostname) ? url.origin : null;
  } catch {
    return null;
  }
}
