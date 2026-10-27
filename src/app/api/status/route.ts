import type { StatusResponse } from "@/lib/api-types";
import { modelFor } from "@/server/ai/models";
import { paypalConfigFromEnv } from "@/server/paypal/client";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/** Which services this server is connected to, and the model behind each job. Never the keys. */
export async function GET() {
  const body: StatusResponse = {
    paypal: paypalConfigFromEnv() !== null,
    tokenFactory: Boolean(process.env.NEBIUS_API_KEY?.trim()),
    tavily: Boolean(process.env.TAVILY_API_KEY?.trim()),
    store: getStore().kind,
    models: {
      fast: modelFor("fast"),
      draft: modelFor("draft"),
      decide: modelFor("decide"),
      embed: modelFor("embed"),
    },
  };
  return Response.json(body);
}
