import type { StatusResponse } from "@/lib/api-types";
import { modelFor } from "@/server/ai/models";
import { authReady } from "@/server/auth/config";
import { encryptionReady } from "@/server/crypto/secrets";
import { paypalConfigFromEnv } from "@/server/paypal/client";
import { publicOrigin } from "@/server/site";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/** Which services this server has, and the model behind each job. Never the keys. */
export async function GET() {
  const body: StatusResponse = {
    tokenFactory: Boolean(process.env.NEBIUS_API_KEY?.trim()),
    tavily: Boolean(process.env.TAVILY_API_KEY?.trim()),
    store: getStore().kind,
    auth: authReady(),
    encryption: encryptionReady(),
    storefront: paypalConfigFromEnv() !== null,
    publicSite: publicOrigin() !== null,
    models: {
      fast: modelFor("fast"),
      draft: modelFor("draft"),
      decide: modelFor("decide"),
      embed: modelFor("embed"),
    },
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
