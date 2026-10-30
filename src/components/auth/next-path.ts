import { safeNext } from "@/lib/next-path";

export { safeNext as safeNextPath };

/** A page's search param as one string: the first when it's repeated. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** A sign-in page's address that keeps the place to return to: withNext("/signup", "/app") → "/signup?next=%2Fapp". */
export function withNext(path: string, next: string | null | undefined): string {
  const safe = safeNext(next);
  return safe ? `${path}?next=${encodeURIComponent(safe)}` : path;
}
