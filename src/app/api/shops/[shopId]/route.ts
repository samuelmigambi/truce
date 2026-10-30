import { z } from "zod";
import { SETUP_STEPS, type SetupStep } from "@/lib/domain";
import type { ShopResponse, UpdateShopRequest } from "@/lib/api-types";
import { notificationPrefsSchema, shopPoliciesSchema, shopProfileSchema } from "@/lib/validation";
import { readBody } from "@/server/actions/errors";
import { json, noContent, shopRoute } from "@/server/http";
import { enforceLimit } from "@/server/limits";
import { deleteShop, updateShop } from "@/server/setup/shops";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

const updateSchema: z.ZodType<UpdateShopRequest> = z
  .object({
    profile: shopProfileSchema.optional(),
    policies: shopPoliciesSchema.optional(),
    notifications: notificationPrefsSchema.optional(),
    setupStep: z
      .enum(SETUP_STEPS as readonly [SetupStep, ...SetupStep[]], {
        error: "That isn't a setup step.",
      })
      .optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), "Send something to change.");

/** The shop, for its members. Works during setup too, so onboarding can resume. */
export const GET = shopRoute(
  "read",
  async ({ shop, role }) => {
    const body: ShopResponse = { shop, role };
    return json(body);
  },
  { ready: false },
);

/** Changes the shop's profile, policies, the member's own notifications, or its setup step. */
export const PATCH = shopRoute(
  "read",
  async ({ request, user, shop, role }) => {
    await enforceLimit(
      `shop-edit:${shop.id}`,
      120,
      60 * 60,
      "That's a lot of changes. Try again in a little while.",
    );
    const body = await readBody(request, updateSchema);
    return json(await updateShop(getStore(), { user, shop, role }, body));
  },
  { ready: false },
);

/** Deletes the shop and everything in it. Owners only. */
export const DELETE = shopRoute(
  "own",
  async ({ user, shop, role }) => {
    await deleteShop(getStore(), { user, shop, role });
    return noContent();
  },
  { ready: false },
);
