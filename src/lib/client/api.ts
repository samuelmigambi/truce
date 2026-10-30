import type { ApiError } from "@/lib/api-types";

/** A failed API call, with the route's own message, code and field errors when it sent them. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null = null,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const FALLBACK = "Something went wrong on our side. Try again in a moment.";

async function toError(response: Response): Promise<HttpError> {
  let message =
    response.status === 429
      ? "That's a lot at once. Try again in a minute."
      : response.status === 401
        ? "Your session has ended. Sign in again."
        : FALLBACK;
  let code: string | null = null;
  let fields: Record<string, string> = {};
  try {
    const body = (await response.json()) as Partial<ApiError>;
    if (typeof body.error === "string" && body.error) message = body.error;
    if (typeof body.code === "string") code = body.code;
    if (body.fields && typeof body.fields === "object") fields = body.fields;
  } catch {
    // Not JSON; keep the plain message.
  }
  return new HttpError(response.status, message, code, fields);
}

/** A signed-out answer anywhere in the app goes back to sign-in, then returns here. */
function onSignedOut(response: Response) {
  if (response.status !== 401 || typeof window === "undefined") return;
  const here = window.location.pathname + window.location.search;
  if (here.startsWith("/signin") || here.startsWith("/signup")) return;
  // A full load, so the server pages check the session afresh.
  window.location.assign(
    new URL(`/signin?next=${encodeURIComponent(here)}`, window.location.origin),
  );
}

async function send<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...init.headers },
  });
  if (!response.ok) {
    onSignedOut(response);
    throw await toError(response);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  return send<T>(url, { ...init, method: "GET" });
}

export function postJson<T>(url: string, body?: unknown, init?: RequestInit): Promise<T> {
  return send<T>(url, { ...init, method: "POST", ...json(body) });
}

export function patchJson<T>(url: string, body: unknown, init?: RequestInit): Promise<T> {
  return send<T>(url, { ...init, method: "PATCH", ...json(body) });
}

export function deleteJson<T = void>(url: string, init?: RequestInit): Promise<T> {
  return send<T>(url, { ...init, method: "DELETE" });
}

/** The fetcher SWR uses for every GET. */
export const fetcher = <T>(url: string) => getJson<T>(url);

/** A message for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  if (error instanceof TypeError)
    return "Can't reach Truce right now. Check your connection and try again.";
  if (error instanceof Error && error.message) return error.message;
  return FALLBACK;
}

/** Field errors from a failed save, for a form: `{ "profile.website": "…" }`. */
export function fieldErrors(error: unknown): Record<string, string> {
  return error instanceof HttpError ? error.fields : {};
}

/** Starts a server-sent event stream with a POST, throwing a readable error if the route refuses. */
export async function openStream(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body ?? {}),
    signal,
  });
  if (!response.ok) {
    onSignedOut(response);
    throw await toError(response);
  }
  return response;
}

/** The API path for something in a shop: shopPath("sh_1", "cases") → "/api/shops/sh_1/cases". */
export function shopApi(shopId: string, path = ""): string {
  const base = `/api/shops/${encodeURIComponent(shopId)}`;
  return path ? `${base}/${path.replace(/^\//, "")}` : base;
}

/** The app path for a shop's screen: shopHref("sh_1", "orders") → "/app/sh_1/orders". */
export function shopHref(shopId: string, path = ""): string {
  const base = `/app/${encodeURIComponent(shopId)}`;
  return path ? `${base}/${path.replace(/^\//, "")}` : base;
}
