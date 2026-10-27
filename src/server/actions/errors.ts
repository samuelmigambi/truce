import "server-only";

import type { z } from "zod";

/** An error meant for the seller: a plain message that's safe to show, with its HTTP status. */
export class ActionError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

/** `{ error }` with a status, the shape every route uses for failures. */
export function errorResponse(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

/** Runs a route's work: ActionErrors become `{ error }` responses, anything else a logged 500. */
export async function respond(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ActionError) return errorResponse(error.status, error.message);
    console.error("[api] failed", error);
    return errorResponse(500, "Something went wrong on our side. Try again in a moment.");
  }
}

/** The request's JSON body, checked against a schema; a bad body is a 400 that says what's wrong. */
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ActionError(400, "Send the details as JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw new ActionError(400, `${where}${issue?.message ?? "Those details don't look right."}`);
  }
  return parsed.data;
}
