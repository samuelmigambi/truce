import { eventStream } from "@/lib/sse";
import { analyzeCase } from "@/server/ai/pipeline";
import { analysisDeps } from "@/server/ai/wiring";
import { shopRoute } from "@/server/http";
import { enforceLimit } from "@/server/limits";
import { runShopSync } from "@/server/setup/sync-stream";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * Streams a sync as SyncEvents: a shop's first sync (which ends with it ready, after a real
 * analysis of its most urgent case), or "Sync now" later. The work carries on if the browser
 * leaves; the stream only stops sending.
 */
export const POST = shopRoute(
  "act",
  async ({ request, user, shop }) => {
    await enforceLimit(
      `sync:${shop.id}`,
      30,
      60 * 60,
      "That's a lot of syncs. Try again in a little while.",
    );
    const events = runShopSync({
      store: getStore(),
      shop,
      user,
      analyze: (current, caseId) => analyzeCase(analysisDeps(current, caseId, false)),
    });
    return eventStream(events, request.signal);
  },
  { ready: false },
);
