import type { ApiError } from "@/lib/api-types";

/** A failed API call, with the route's own message when it sent one. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const FALLBACK = "Something went wrong on our side. Try again in a moment.";

async function toError(response: Response): Promise<HttpError> {
  let message = response.status === 429 ? "That's a lot at once. Try again in a minute." : FALLBACK;
  try {
    const body = (await response.json()) as Partial<ApiError>;
    if (typeof body.error === "string" && body.error) message = body.error;
  } catch {
    // Not JSON; keep the plain message.
  }
  return new HttpError(response.status, message);
}

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!response.ok) throw await toError(response);
  return (await response.json()) as T;
}

export async function postJson<T>(url: string, body?: unknown, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    ...init,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw await toError(response);
  return (await response.json()) as T;
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
  if (!response.ok) throw await toError(response);
  return response;
}
