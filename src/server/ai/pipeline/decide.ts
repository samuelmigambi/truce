import "server-only";

import { z } from "zod";
import type { CurrencyCode, Move, Recommendation } from "@/lib/domain";
import { formatMoney, type Cents } from "@/lib/money";
import { cheapestMove, costMoves, type Evidence, type MoveCost } from "@/lib/rules/options";
import type { ProtectionResult } from "@/lib/rules/protection";
import {
  caseBlock,
  costsBlock,
  decideSystem,
  evidenceBlock,
  protectionBlock,
  strengthSystem,
  type PromptRecord,
} from "../prompts";
import { askForJson } from "../structured";
import { failureReason, metered, stepFailed, TIMEOUTS } from "./run";
import type { Run } from "./types";

/**
 * Weighing and deciding. Lightning judges how strong the evidence is; Truce's rules turn that into
 * what each move costs; Ultra picks the move with those figures in front of it. Its answer is
 * checked in code: every cited record must exist, settling must still be possible, and leaving
 * the cheapest move needs a reason the records support.
 */

export const MOVE_WORD: Record<Move, string> = {
  fight: "Fight",
  settle: "Settle",
  refund: "Refund",
};
const MOVE_GERUND: Record<Move, string> = {
  fight: "fighting",
  settle: "settling",
  refund: "refunding",
};

function unknownIds(ids: Set<string>, cited: string[]): string[] {
  return [...new Set(cited.filter((id) => !ids.has(id)))];
}

// ---------- Weigh ----------

export function strengthSchema(ids: Set<string>) {
  return z
    .object({
      strength: z.enum(["strong", "mixed", "weak"]),
      why: z.string().min(10).max(500).describe("One or two plain sentences."),
      evidence: z
        .array(z.string())
        .min(1)
        .max(8)
        .describe("IDs of the records that drive the judgement, like E3."),
    })
    .superRefine((v, ctx) => {
      const unknown = unknownIds(ids, v.evidence);
      if (unknown.length) {
        ctx.addIssue({
          code: "custom",
          path: ["evidence"],
          message: `Unknown evidence IDs: ${unknown.join(", ")}. Use only IDs from the records.`,
        });
      }
    });
}

/** Code's own read of the evidence, for when the model can't be reached. */
export function fallbackStrength(run: Run, protection: ProtectionResult): Evidence {
  if (protection.covered) return "strong";
  if (run.kase.reason === "not_received")
    return run.order?.tracking?.deliveredAt ? "mixed" : "weak";
  return "mixed";
}

export interface Weighed {
  strength: Evidence;
  why: string;
  options: MoveCost[];
  cheapest: MoveCost;
  /** The partial refund to offer, while settling is possible. */
  offer: Cents | null;
}

export async function weighStep(
  run: Run,
  records: PromptRecord[],
  protection: ProtectionResult,
): Promise<Weighed> {
  const model = run.deps.models.fast;
  run.emit({
    type: "step",
    step: "weigh",
    state: "start",
    label: "Weighing the evidence and the costs",
    model,
  });
  let strength: Evidence;
  let why = "";
  let failed = false;
  try {
    const ids = new Set(records.map((r) => r.id));
    const answer = await metered(run, "weigh", model, TIMEOUTS.weigh.deadline, async (signal) => {
      const a = await askForJson({
        client: run.client,
        model,
        system: strengthSystem(),
        messages: [
          {
            role: "user",
            content: `${caseBlock(run.kase, run.now, run.deps.shop)}\n\n${protectionBlock(protection)}\n\nEvidence records:\n${evidenceBlock(records, run.deps.shop.timeZone)}\n\nJudge the strength of the seller's evidence and record it.`,
          },
        ],
        name: "record_strength",
        description: "Record how strong the seller's evidence is.",
        schema: strengthSchema(ids),
        // With thinking on, Lightning sometimes reasoned past 45 s here (27 Oct); the criteria are plain enough.
        thinking: false,
        maxTokens: 800,
        signal,
        attemptTimeoutMs: TIMEOUTS.weigh.attempt,
      });
      return { value: a.value, usage: a.usage };
    });
    strength = answer.strength;
    why = answer.why;
  } catch (error) {
    failed = true;
    strength = stepFailed(
      run,
      "weigh",
      model,
      error,
      `Lightning ${failureReason(error)}, so the evidence was rated by Truce's rules alone`,
      fallbackStrength(run, protection),
    );
  }

  const options = costMoves({
    amount: run.kase.amount,
    reason: run.kase.reason,
    stage: run.kase.stage,
    protectedSale: protection.covered,
    highVolume: run.ratio.highVolume,
    evidence: strength,
  });
  const cheapest = cheapestMove(options);
  const settle = options.find((o) => o.move === "settle");
  const offer = settle?.available ? settle.expected : null;
  if (!failed) {
    run.emit({
      type: "step",
      step: "weigh",
      state: "done",
      label: `Evidence is ${strength} · ${MOVE_GERUND[cheapest.move]} costs least (${formatMoney(cheapest.expected, run.deps.shop.currency)} expected)`,
      model,
    });
  }
  return { strength, why, options, cheapest, offer };
}

// ---------- Decide ----------

export function decisionSchema(
  ids: Set<string>,
  options: MoveCost[],
  cheapest: MoveCost,
  currency: CurrencyCode,
) {
  const available = options.filter((o) => o.available).map((o) => o.move) as [Move, ...Move[]];
  const Cited = z.object({
    text: z.string().min(8).max(320).describe("One plain sentence."),
    evidence: z
      .array(z.string())
      .min(1)
      .max(6)
      .describe("IDs of the records it rests on, like E3."),
  });
  return z
    .object({
      move: z.enum(available),
      confidence: z.enum(["high", "medium", "low"]),
      headline: z
        .string()
        .min(12)
        .max(180)
        .describe("One plain sentence that starts with the move, like 'Fight: …'."),
      reasons: z.array(Cited).min(2).max(4),
      departure: Cited.nullable().describe(
        `Why not ${cheapest.move}, the cheapest available move. Required when move isn't ${cheapest.move}; null when it is.`,
      ),
    })
    .superRefine((v, ctx) => {
      const cited = [...v.reasons.flatMap((r) => r.evidence), ...(v.departure?.evidence ?? [])];
      const unknown = unknownIds(ids, cited);
      if (unknown.length) {
        ctx.addIssue({
          code: "custom",
          path: ["reasons"],
          message: `Unknown evidence IDs: ${unknown.join(", ")}. Cite only IDs from the records.`,
        });
      }
      if (v.move !== cheapest.move && !v.departure) {
        ctx.addIssue({
          code: "custom",
          path: ["departure"],
          message: `${v.move} isn't the cheapest available move (${cheapest.move} is, at ${formatMoney(cheapest.expected, currency)} expected). Explain why in departure, citing evidence, or choose ${cheapest.move}.`,
        });
      }
      if (!new RegExp(`^\\W*${MOVE_WORD[v.move]}\\b`, "i").test(v.headline)) {
        ctx.addIssue({
          code: "custom",
          path: ["headline"],
          message: `The headline must start with "${MOVE_WORD[v.move]}".`,
        });
      }
    });
}

export type Decision = z.infer<ReturnType<typeof decisionSchema>>;

/** The decision as the app shows it: the reason for leaving the cheapest move is the last reason. */
export function toRecommendation(
  decision: Decision,
  cheapest: MoveCost,
  offer: Cents | null,
): Recommendation {
  const reasons = [...decision.reasons];
  if (decision.departure && decision.move !== cheapest.move) reasons.push(decision.departure);
  const headline = decision.headline.trim().replace(/^\W+/, "");
  return {
    move: decision.move,
    confidence: decision.confidence,
    headline: headline.charAt(0).toUpperCase() + headline.slice(1),
    reasons: reasons.map((r) => ({ text: r.text.trim(), evidence: [...new Set(r.evidence)] })),
    ...(decision.move === "settle" && offer !== null ? { offerAmount: offer } : {}),
  };
}

/** The cheapest move, explained from the numbers alone, for when the model can't be reached. */
export function fallbackRecommendation(
  records: PromptRecord[],
  protection: ProtectionResult,
  weighed: Weighed,
  currency: CurrencyCode,
): Recommendation {
  const { cheapest, offer } = weighed;
  const expected = formatMoney(cheapest.expected, currency);
  const cite = (kind: string) => records.filter((r) => r.kind === kind).map((r) => r.id);
  const money = [...cite("payment"), ...cite("tracking")].slice(0, 2);
  const anchor = money.length ? money : records.slice(0, 1).map((r) => r.id);
  return {
    move: cheapest.move,
    confidence: "low",
    headline: `${MOVE_WORD[cheapest.move]}: it costs least by Truce's numbers, ${expected} expected.`,
    reasons: [
      {
        text: `By Truce's rules, ${MOVE_GERUND[cheapest.move]} has the lowest expected cost: ${expected}.`,
        evidence: anchor,
      },
      {
        text: protection.covered
          ? "Seller Protection covers this case."
          : "Seller Protection doesn't cover this case.",
        evidence: anchor,
      },
    ],
    ...(cheapest.move === "settle" && offer !== null ? { offerAmount: offer } : {}),
  };
}

export async function decideStep(
  run: Run,
  records: PromptRecord[],
  protection: ProtectionResult,
  weighed: Weighed,
): Promise<Recommendation> {
  const model = run.deps.models.decide;
  const { shop } = run.deps;
  run.emit({ type: "step", step: "decide", state: "start", label: "Choosing the move", model });
  const ids = new Set(records.map((r) => r.id));
  const content = [
    caseBlock(run.kase, run.now, shop),
    protectionBlock(protection),
    `Evidence strength, judged from the records: ${weighed.strength}.${weighed.why ? ` ${weighed.why}` : ""}`,
    costsBlock(weighed.options, weighed.cheapest, weighed.offer, run.ratio, shop.currency),
    `Evidence records:\n${evidenceBlock(records, shop.timeZone)}`,
    "Decide what the seller should do, and record it.",
  ].join("\n\n");
  try {
    const decision = await metered(
      run,
      "decide",
      model,
      TIMEOUTS.decide.deadline,
      async (signal) => {
        const a = await askForJson({
          client: run.client,
          model,
          system: decideSystem(shop),
          messages: [{ role: "user", content }],
          name: "record_decision",
          description: "Record the recommended move, with reasons that cite evidence IDs.",
          schema: decisionSchema(ids, weighed.options, weighed.cheapest, shop.currency),
          thinking: true,
          maxTokens: 8000,
          signal,
          attemptTimeoutMs: TIMEOUTS.decide.attempt,
        });
        return { value: a.value, usage: a.usage };
      },
    );
    const recommendation = toRecommendation(decision, weighed.cheapest, weighed.offer);
    run.emit({
      type: "step",
      step: "decide",
      state: "done",
      label: recommendation.headline,
      model,
    });
    return recommendation;
  } catch (error) {
    return stepFailed(
      run,
      "decide",
      model,
      error,
      `Ultra ${failureReason(error)}, so this is the cheapest move by Truce's numbers. Review it before approving`,
      fallbackRecommendation(records, protection, weighed, shop.currency),
    );
  }
}
