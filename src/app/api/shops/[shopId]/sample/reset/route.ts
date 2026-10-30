import { json, shopRoute } from "@/server/http";
import { enforceLimit } from "@/server/limits";
import { resetSample } from "@/server/setup/shops";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/** Starts the sample shop over from fresh sample data. */
export const POST = shopRoute("manage", async ({ user, shop, role }) => {
  await enforceLimit(
    `sample-reset:${shop.id}`,
    12,
    60 * 60,
    "That's a lot of fresh starts. Try again in a little while.",
  );
  return json(await resetSample(getStore(), { user, shop, role }));
});
