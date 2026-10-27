import { z } from "zod";
import type { OwnerSignInRequest } from "@/lib/api-types";
import { ActionError, readBody, respond } from "@/server/actions/errors";
import { rateLimit } from "@/server/limits";
import { clientIp, signInOwner, signOutOwner } from "@/server/session";

export const dynamic = "force-dynamic";

const TRIES_PER_HOUR = 10;

const signInSchema: z.ZodType<OwnerSignInRequest> = z.object({
  key: z.string().min(1, "Send the owner key.").max(512),
});

/**
 * Signs the owner in to the live sandbox: the key (from the /owner page, never a URL) is compared
 * with TRUCE_OWNER_KEY in constant time, a few tries an hour per network. Sets the cookies.
 */
export async function POST(request: Request) {
  return respond(async () => {
    const { key } = await readBody(request, signInSchema);
    if (!(await rateLimit(`owner:${clientIp(request.headers)}`, TRIES_PER_HOUR, 60 * 60))) {
      throw new ActionError(429, "Too many tries. Try again in an hour.");
    }
    if (!(await signInOwner(key))) throw new ActionError(403, "That key didn't match.");
    return new Response(null, { status: 204 });
  });
}

/** Signs the owner out, back to a demo copy. */
export async function DELETE() {
  await signOutOwner();
  return new Response(null, { status: 204 });
}
