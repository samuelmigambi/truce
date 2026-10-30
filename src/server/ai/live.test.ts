import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AnalysisEvent } from "@/lib/api-types";
import type { Analysis, Shop } from "@/lib/domain";
import { tokenFactory } from "./client";
import { modelsFromEnv, shortModelName } from "./models";
import { publicPhotoReader } from "./photos";
import { chatTurn } from "./chat";
import { analyzeCase } from "./pipeline";
import { webReader } from "./web";
import { fakeBudget, memoryStore } from "./testing/fakes";
import { sampleShop } from "./testing/fixtures";

/**
 * The whole analysis on Token Factory, in a fresh sample shop seeded with Wick & Ember. Runs only
 * with NEBIUS_API_KEY set, costs a few cents, and prints a short summary: the move, the cost, and
 * each step's model and time. TRUCE_LIVE_CASE picks the cases, comma-separated (the cracked mug by
 * default) and TRUCE_PHOTO_ROOT where the sample photos are, when they aren't in public/ yet.
 * Vitest keeps a passing test's output to itself, so run it with --silent=false to see the summary.
 */

/** A sample shop seeded at `seededAt` with the real Wick & Ember seed, as the app makes one. */
async function seededSample(
  store: ReturnType<typeof memoryStore>,
  seededAt: string,
  id: string,
): Promise<Shop> {
  // Loaded here, not at the top, so the file loads (and skips) without the seed's dependencies.
  const { buildSeed, seedVersionFor } = await import("@/server/demo/seed");
  const shop = sampleShop({ id, seededAt, seedVersion: seedVersionFor(seededAt) });
  const seed = buildSeed(seededAt);
  await store.saveShop(shop);
  for (const order of seed.orders) await store.saveOrder(id, order);
  for (const kase of seed.cases) await store.saveCase(id, kase);
  for (const [caseId, events] of Object.entries(seed.events))
    for (const e of events) await store.addEvent(id, caseId, e);
  return shop;
}

/** One case analyzed live, then replayed in a sample shop seeded two days later; returns the summary lines. */
async function check(
  caseId: string,
  run: number,
): Promise<{ lines: string[]; analysis: Analysis; clean: boolean; replayed: boolean }> {
  const store = memoryStore();
  const created = new Date();
  const shop = await seededSample(
    store,
    created.toISOString(),
    `sh_livesample${String(run).padStart(4, "0")}`,
  );
  const budget = fakeBudget();
  const deps = {
    store,
    client: tokenFactory(),
    caseId,
    budget,
    models: modelsFromEnv(),
    seedCaseId: caseId,
    web: webReader(),
    siteUrl: process.env.SITE_URL ?? null,
    readPhoto: publicPhotoReader(process.env.TRUCE_PHOTO_ROOT),
  };

  const started = Date.now();
  const open = new Map<string, number>();
  const wall = new Map<string, number>();
  const problems: string[] = [];
  let result: Analysis | null = null;
  for await (const event of analyzeCase({ ...deps, shop })) {
    if (event.type === "step" && event.state === "start") open.set(event.step, Date.now());
    if (event.type === "step" && event.state !== "start")
      wall.set(event.step, Date.now() - (open.get(event.step) ?? started));
    if (event.type === "step" && event.state === "error")
      problems.push(`${event.step}: ${event.label}`);
    if (event.type === "tool" && event.state === "error") problems.push(`tool: ${event.label}`);
    if (event.type === "error") problems.push(event.message);
    if (event.type === "result") result = event.analysis;
  }
  const total = Date.now() - started;
  if (!result) throw new Error(`No result for ${caseId}: ${problems.join(" | ")}`);
  const a: Analysis = result;

  const lines = [
    `case ${caseId}: ${a.recommendation.move} (${a.recommendation.confidence}) · ${a.recommendation.headline}`,
    `evidence ${a.evidenceStrength}; ${a.evidence.length} records; similar: ${a.similar.map((s) => `${s.caseId} ${s.similarity}`).join(", ") || "none"}`,
    `draft ${a.draft.kind}, ${a.draft.text.split(/\s+/).length} words, cites ${a.draft.evidenceIds.join(" ")}; check ${a.verification.ok ? "passed" : "flagged"} (${a.verification.checked.filter((c) => !c.supported).length} open)`,
    `cost $${a.totalCost.toFixed(4)} · ${(total / 1000).toFixed(1)} s in all`,
    ...a.steps.map(
      (s) =>
        `  ${s.step.padEnd(8)} ${shortModelName(s.model).padEnd(17)} ${String(s.ms).padStart(6)} ms  in ${s.inputTokens} / out ${s.outputTokens} / cached ${s.cachedTokens}  $${(s.cost ?? 0).toFixed(5)}`,
    ),
    `  wall time by step: ${[...wall].map(([step, ms]) => `${step} ${(ms / 1000).toFixed(1)} s`).join(", ")}`,
    ...(problems.length ? [`  fallbacks: ${problems.join(" | ")}`] : []),
  ];

  // A sample shop seeded two days later replays the recording at its real pace, moved to its
  // calendar, for free.
  const later = new Date(created.getTime() + 2 * 24 * 60 * 60 * 1000);
  const copy = await seededSample(
    store,
    later.toISOString(),
    `sh_livelater${String(run).padStart(5, "0")}`,
  );
  const replayStart = Date.now();
  let replayed: (AnalysisEvent & { type: "result" }) | null = null;
  for await (const event of analyzeCase({ ...deps, shop: copy, now: () => later })) {
    if (event.type === "result") replayed = event;
  }
  lines.push(
    replayed
      ? `  replay in a sample shop two days later: ${replayed.replayed ? "replayed" : "ran live"} in ${Date.now() - replayStart} ms`
      : "  replay: no result",
  );
  return {
    lines,
    analysis: a,
    clean: problems.length === 0,
    replayed: replayed?.replayed ?? false,
  };
}

describe.skipIf(!process.env.NEBIUS_API_KEY)("live on Token Factory", () => {
  it("analyzes seeded sample cases end to end, then replays each in a later sample shop", async () => {
    const cases = (process.env.TRUCE_LIVE_CASE ?? "demo-damaged-28")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const out: Record<string, Analysis> = {};
    for (const [n, caseId] of cases.entries()) {
      const { lines, analysis, clean, replayed } = await check(caseId, n);
      console.log(lines.join("\n"));
      out[caseId] = analysis;
      expect(analysis.steps.length).toBeGreaterThanOrEqual(6);
      expect(replayed).toBe(clean);
    }
    // The whole analyses, to read the models' work closely (no keys in them).
    if (process.env.TRUCE_LIVE_OUT)
      writeFileSync(process.env.TRUCE_LIVE_OUT, JSON.stringify(out, null, 2));
  }, 600_000);
});

describe.skipIf(!process.env.NEBIUS_API_KEY || !process.env.TRUCE_LIVE_CHAT)(
  "Ask Truce, live",
  () => {
    it("answers the three questions the demo asks", async () => {
      const store = memoryStore();
      const shop = await seededSample(store, new Date().toISOString(), "sh_livesamplechat");
      const questions = (
        process.env.TRUCE_LIVE_CHAT === "1"
          ? "Which orders are at risk this week?|Why did we lose the mug dispute?|Refund Sam and say sorry"
          : process.env.TRUCE_LIVE_CHAT!
      ).split("|");
      for (const question of questions) {
        const started = Date.now();
        const tools: string[] = [];
        const cards: string[] = [];
        let text = "";
        let cost = 0;
        for await (const event of chatTurn({
          store,
          client: tokenFactory(),
          shop,
          budget: fakeBudget(),
          models: modelsFromEnv(),
          request: { messages: [{ role: "user", content: question }] },
        })) {
          if (event.type === "tool-start") tools.push(event.name);
          if (event.type === "card")
            cards.push(
              event.card.kind === "action"
                ? `action:${event.card.move}:${event.card.label}`
                : event.card.kind,
            );
          if (event.type === "text") text += event.delta;
          if (event.type === "usage") cost += event.cost ?? 0;
          if (event.type === "error") text += ` [error: ${event.message}]`;
        }
        console.log(
          [
            `Q: ${question} (${((Date.now() - started) / 1000).toFixed(1)} s, $${cost.toFixed(4)})`,
            `  tools: ${tools.join(", ") || "none"} · cards: ${cards.join(", ") || "none"}`,
            `  A: ${text.trim().replaceAll("\n", " ").slice(0, 400)}`,
          ].join("\n"),
        );
        expect(text.trim().length).toBeGreaterThan(0);
      }
    }, 300_000);
  },
);
