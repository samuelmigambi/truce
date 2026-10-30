import { eventStream } from "@/lib/sse";
import { runSweep } from "@/server/ai/sweep";
import { sweepDeps } from "@/server/ai/wiring";
import { shopRoute } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * The overnight check, run now: new disputes from the shop's PayPal app, every unread case
 * sorted by Lightning, and the orders waiting to ship checked against Seller Protection.
 */
export const POST = shopRoute("act", async ({ request, shop }) => {
  return eventStream(runSweep(sweepDeps(shop, false)), request.signal);
});
