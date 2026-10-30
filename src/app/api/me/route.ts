import { z } from "zod";
import type { MeResponse, UpdateMeRequest } from "@/lib/api-types";
import { personNameSchema } from "@/lib/validation";
import { readBody, respond } from "@/server/actions/errors";
import { requireUser } from "@/server/auth/guard";
import { refreshVerification } from "@/server/auth/session";
import { json } from "@/server/http";
import { enforceLimit } from "@/server/limits";
import { meResponse, updateName } from "@/server/setup/shops";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

const updateSchema: z.ZodType<UpdateMeRequest> = z.object({ name: personNameSchema });

/** The account and its shops. `?refresh=1` asks Firebase whether the email is verified now. */
export async function GET(request: Request) {
  return respond(async () => {
    const store = getStore();
    let user = await requireUser(request);
    if (new URL(request.url).searchParams.get("refresh") === "1") {
      user = await refreshVerification(user, store);
    }
    const body: MeResponse = await meResponse(store, user);
    return json(body);
  });
}

/** Saves the person's name: onboarding's first step, or a change in account settings. */
export async function PATCH(request: Request) {
  return respond(async () => {
    const store = getStore();
    const user = await requireUser(request);
    await enforceLimit(
      `me:${user.uid}`,
      60,
      60 * 60,
      "That's a lot of changes. Try again in a little while.",
    );
    const { name } = await readBody(request, updateSchema);
    const body: MeResponse = await meResponse(store, await updateName(store, user, name));
    return json(body);
  });
}
