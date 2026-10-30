import type { AuthConfigResponse } from "@/lib/api-types";
import { authConfig } from "@/server/auth/config";

export const dynamic = "force-dynamic";

/** Firebase's web config (public by design), the emulator in development, and whether Google sign-in is on. */
export async function GET() {
  const body: AuthConfigResponse = authConfig();
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
