import { z } from "zod";
import type { CreateShopRequest, ShopResponse } from "@/lib/api-types";
import { shopProfileSchema } from "@/lib/validation";
import { readBody, respond } from "@/server/actions/errors";
import { requireUser } from "@/server/auth/guard";
import { json } from "@/server/http";
import { createShop, meResponse } from "@/server/setup/shops";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

const createSchema: z.ZodType<CreateShopRequest> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("real"), profile: shopProfileSchema }),
  z.object({ kind: z.literal("sample") }),
]);

/** The person's shops. */
export async function GET(request: Request) {
  return respond(async () => {
    const user = await requireUser(request);
    const { shops } = await meResponse(getStore(), user);
    return json({ shops });
  });
}

/** A new shop: a real one from its details (onboarding's shop step), or the sample shop. */
export async function POST(request: Request) {
  return respond(async () => {
    const user = await requireUser(request);
    const body = await readBody(request, createSchema);
    const created: ShopResponse = await createShop(getStore(), user, body);
    return json(created, { status: 201 });
  });
}
