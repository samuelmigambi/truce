/**
 * Where a person may be sent after signing in: only a path inside the app or onboarding, never
 * another site. One rule for the server pages and the browser alike, so it lives here rather
 * than in a browser-only module.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return /^\/(app|onboarding)(\/|\?|$)/.test(next) ? next : null;
}
