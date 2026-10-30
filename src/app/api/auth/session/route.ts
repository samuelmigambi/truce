import { z } from "zod";
import type { SessionRequest, SessionResponse } from "@/lib/api-types";
import { readBody, respond } from "@/server/actions/errors";
import { checkOrigin, clientIp } from "@/server/auth/guard";
import { endSession, startSession } from "@/server/auth/session";
import { json, noContent } from "@/server/http";
import { enforceLimit } from "@/server/limits";
import { landingPath, shopSummary } from "@/server/shops";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

const sessionSchema: z.ZodType<SessionRequest> = z.object({
  idToken: z.string().min(20, "Sign in again.").max(8192, "Sign in again."),
});

/** Trades a fresh Firebase ID token for the session cookie, and says where to go next. */
export async function POST(request: Request) {
  return respond(async () => {
    checkOrigin(request);
    await enforceLimit(
      `session:${clientIp(request.headers)}`,
      30,
      60 * 60,
      "Too many sign-ins from your network. Try again in a little while.",
    );
    const { idToken } = await readBody(request, sessionSchema);
    const store = getStore();
    const user = await startSession(idToken, store);
    const shops = (await store.listShopsFor(user.uid)).map((s) => shopSummary(s, user.uid));
    const body: SessionResponse = { user, next: landingPath(user, shops) };
    return json(body);
  });
}

/** Signs this browser out. */
export async function DELETE(request: Request) {
  return respond(async () => {
    checkOrigin(request);
    await endSession();
    return noContent();
  });
}
