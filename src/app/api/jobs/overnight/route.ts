import { timingSafeEqual, createHash } from "node:crypto";
import { errorResponse, respond } from "@/server/actions/errors";
import { runSweep } from "@/server/ai/sweep";
import { sweepDeps } from "@/server/ai/wiring";
import { log } from "@/server/log";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";
/** Cloud Run's own limit; shops are swept one after another within it. */
export const maxDuration = 300;

/** Compares two secrets in constant time, whatever their lengths. */
function safeEqual(a: string, b: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * For Cloud Scheduler: the overnight check on every shop connected to PayPal, with a full
 * analysis prepared for each new case. Needs the header x-truce-job-key to match TRUCE_JOB_KEY.
 * Sample shops have nothing to fetch, so they're skipped. Answers with a short summary.
 */
export async function POST(request: Request) {
  const expected = process.env.TRUCE_JOB_KEY?.trim();
  const given = request.headers.get("x-truce-job-key")?.trim() ?? "";
  if (!expected || !safeEqual(given, expected))
    return errorResponse(401, "This job needs its key.");

  return respond(async () => {
    const started = Date.now();
    const shops = (await getStore().listConnectedShops()).filter((s) => s.status === "ready");
    const results: {
      shopId: string;
      analyzed: number;
      flagged: number;
      cost: number;
      notes: string[];
    }[] = [];
    for (const shop of shops) {
      // Leave time to answer: the rest wait for tomorrow's run.
      if (Date.now() - started > 240_000) break;
      const summary = { shopId: shop.id, analyzed: 0, flagged: 0, cost: 0, notes: [] as string[] };
      try {
        for await (const event of runSweep(sweepDeps(shop, true))) {
          if (event.type === "done") {
            summary.analyzed = event.analyzed;
            summary.flagged = event.flagged;
          }
          if (event.type === "usage") summary.cost += event.cost ?? 0;
          if (event.type === "error") summary.notes.push(event.message);
        }
      } catch (error) {
        log.error("jobs.overnight_shop_failed", { shopId: shop.id, error });
        summary.notes.push("The check stopped partway for this shop.");
      }
      summary.cost = Math.round(summary.cost * 1e6) / 1e6;
      results.push(summary);
    }
    log.info("jobs.overnight_done", { shops: shops.length, swept: results.length });
    return Response.json({ ok: true, shops: shops.length, swept: results.length, results });
  });
}
