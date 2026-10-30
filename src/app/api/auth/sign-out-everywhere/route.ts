import { respond } from "@/server/actions/errors";
import { requireUser } from "@/server/auth/guard";
import { endAllSessions } from "@/server/auth/session";
import { noContent } from "@/server/http";

export const dynamic = "force-dynamic";

/** Ends every session of this account, on every device. */
export async function POST(request: Request) {
  return respond(async () => {
    const user = await requireUser(request);
    await endAllSessions(user);
    return noContent();
  });
}
