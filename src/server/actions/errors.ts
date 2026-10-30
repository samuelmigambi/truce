import "server-only";

import type { z } from "zod";
import type { ApiError } from "@/lib/api-types";
import { issuesToFields } from "@/lib/validation";
import { log } from "@/server/log";

/** An error meant for the person: a plain message that's safe to show, with its HTTP status. */
export class ActionError extends Error {
  readonly code: string | undefined;
  readonly fields: Record<string, string> | undefined;

  constructor(
    readonly status: number,
    message: string,
    options: { code?: string; fields?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = "ActionError";
    this.code = options.code;
    this.fields = options.fields;
  }
}

/** The shape every route uses for failures. */
export function errorResponse(
  status: number,
  message: string,
  extra: { code?: string; fields?: Record<string, string> } = {},
): Response {
  const body: ApiError = { error: message };
  if (extra.code) body.code = extra.code;
  if (extra.fields && Object.keys(extra.fields).length) body.fields = extra.fields;
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Runs a route's work: ActionErrors become ApiError responses, anything else a logged 500. */
export async function respond(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ActionError) {
      return errorResponse(error.status, error.message, { code: error.code, fields: error.fields });
    }
    log.error("api.failed", { error });
    return errorResponse(500, "Something went wrong on our side. Try again in a moment.");
  }
}

/** The first issue as one line, such as "profile.website: That doesn't look like a web address." */
function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
  return `${where}${issue?.message ?? "Those details don't look right."}`;
}

/** Checks a value against a schema; a bad one is a 400 that says what's wrong, field by field. */
export function parseOr400<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ActionError(400, firstIssue(parsed.error), {
      code: "invalid",
      fields: issuesToFields(parsed.error),
    });
  }
  return parsed.data;
}

/** The request's JSON body, checked against a schema. Bodies past 64 KB are refused unread. */
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 64 * 1024) throw new ActionError(413, "That's more than Truce takes in one go.");
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > 64 * 1024)
      throw new ActionError(413, "That's more than Truce takes in one go.");
    raw = text ? JSON.parse(text) : {};
  } catch (error) {
    if (error instanceof ActionError) throw error;
    throw new ActionError(400, "Send the details as JSON.");
  }
  return parseOr400(schema, raw);
}
