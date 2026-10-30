import "server-only";

import { z } from "zod";
import type { Shop, ShopRole, User } from "@/lib/domain";
import { ActionError, parseOr400, respond } from "@/server/actions/errors";
import { requireReadyShop, requireShop } from "@/server/auth/guard";
import type { Capability } from "@/server/shops";

/**
 * What every shop route shares: the session, the shop and the member's role checked first, the
 * path's IDs checked against their shape, and errors turned into ApiError answers. A route only
 * writes what's particular to it.
 */

/** IDs in paths: case and order numbers like "W-1042", PayPal's dispute IDs like "PP-R-SXM-1". */
export const recordId = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_.:-]+$/, "That ID has characters Truce doesn't use.");

export interface ShopRequest {
  request: Request;
  user: User;
  shop: Shop;
  role: ShopRole;
  params: Record<string, string>;
}

type RouteContext = { params: Promise<Record<string, string>> };

/**
 * A route for one shop: `need` is what the role must allow; `ready` (the default) refuses a shop
 * still in setup, since its data routes only open once it's synced.
 */
export function shopRoute(
  need: Capability,
  handler: (ctx: ShopRequest) => Promise<Response>,
  options: { ready?: boolean } = {},
) {
  return (request: Request, context: RouteContext) =>
    respond(async () => {
      const params = await context.params;
      const shopId = params.shopId ?? "";
      const access =
        options.ready === false
          ? await requireShop(request, shopId, need)
          : await requireReadyShop(request, shopId, need);
      for (const [key, value] of Object.entries(params)) {
        if (key !== "shopId") parseOr400(recordId, value);
      }
      return handler({ request, ...access, params });
    });
}

/** JSON that's never cached: everything here is someone's own data. */
export function json(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store", ...init.headers },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

/** A path parameter, decoded, or a 400. */
export function param(params: Record<string, string>, name: string): string {
  const value = params[name];
  if (!value) throw new ActionError(400, `The address is missing its ${name}.`);
  return value;
}
