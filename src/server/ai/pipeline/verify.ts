import "server-only";

import { z } from "zod";
import type { CurrencyCode, Recommendation, Verification } from "@/lib/domain";
import { formatMoney, toCents, type Cents } from "@/lib/money";
import type { CitedSentence } from "../citations";
import { evidenceBlock, MOVE_LABEL, TO_BUYER, verifySystem, type PromptRecord } from "../prompts";
import { askForJson } from "../structured";
import { repairDraft, type Drafted } from "./draft";
import { failureReason, metered, stepFailed, TIMEOUTS } from "./run";
import type { Run } from "./types";

/**
 * The check on Ultra: every sentence of the draft against the evidence records. Code checks the
 * things code can be sure of (amounts, tracking numbers, cited IDs) alongside it. Anything
 * unsupported is rewritten once by the drafter and checked again; whatever still fails is shown
 * to the seller as needing their eye.
 */

export function verdictSchema(ids: Set<string>, count: number) {
  return z
    .object({
      sentences: z
        .array(
          z.object({
            index: z.number().int().min(1).max(count),
            supported: z.boolean(),
            evidence: z
              .array(z.string())
              .max(6)
              .describe("IDs of the records that support it; empty for a sentence with no facts."),
            problem: z
              .string()
              .max(240)
              .nullable()
              .describe(
                "For an unsupported sentence: what the records don't show. Null otherwise.",
              ),
          }),
        )
        .min(1),
      notes: z
        .string()
        .max(400)
        .describe("One or two plain sentences for the seller about the check."),
    })
    .superRefine((v, ctx) => {
      const seen = new Set(v.sentences.map((s) => s.index));
      const missing = Array.from({ length: count }, (_, i) => i + 1).filter((i) => !seen.has(i));
      if (missing.length) {
        ctx.addIssue({
          code: "custom",
          path: ["sentences"],
          message: `Check every sentence; these are missing: ${missing.join(", ")}.`,
        });
      }
      const unknown = [
        ...new Set(v.sentences.flatMap((s) => s.evidence).filter((id) => !ids.has(id))),
      ];
      if (unknown.length) {
        ctx.addIssue({
          code: "custom",
          path: ["sentences"],
          message: `Unknown evidence IDs: ${unknown.join(", ")}.`,
        });
      }
    });
}

type Verdict = z.infer<ReturnType<typeof verdictSchema>>;

/** The amounts a draft may mention: the order, its items and the offer. */
export function allowedAmounts(run: Run, recommendation: Recommendation): Set<Cents> {
  const amounts = new Set<Cents>([run.kase.amount]);
  if (run.order) {
    amounts.add(run.order.amount);
    for (const item of run.order.items) {
      amounts.add(item.unitPrice);
      amounts.add(item.unitPrice * item.quantity);
    }
  }
  if (recommendation.offerAmount) amounts.add(recommendation.offerAmount);
  return amounts;
}

const ABOUT_THE_BUYER = /\bthe (buyer|customer|purchaser)('s|s)?\b/i;
const STOCK_PHRASES =
  /\b(we )?(sincerely )?apologi[sz]e for (any|the) inconvenience\b|\bsorry for (any|the) inconvenience\b|\bthank you for your (understanding|patience) in this matter\b/i;

/** The marks a draft may write money with, longest first, and the currencies each can stand for. */
const MONEY_MARKS: [string, CurrencyCode[]][] = [
  ["US$", ["USD"]],
  ["CA$", ["CAD"]],
  ["AU$", ["AUD"]],
  ["C$", ["CAD"]],
  ["A$", ["AUD"]],
  ["$", ["USD", "CAD", "AUD"]],
  ["£", ["GBP"]],
  ["€", ["EUR"]],
  ["USD", ["USD"]],
  ["CAD", ["CAD"]],
  ["AUD", ["AUD"]],
  ["GBP", ["GBP"]],
  ["EUR", ["EUR"]],
];
const MARK_CURRENCIES = new Map(MONEY_MARKS);
const MARK = MONEY_MARKS.map(([mark]) => mark.replaceAll("$", "\\$")).join("|");
const NUMBER = String.raw`(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?`;
/** "$86", "A$4.30", "£86", "€1,200", or the mark after the number: "86 €", "86 EUR". */
const AMOUNT = new RegExp(
  String.raw`(?<![\p{L}\d])(${MARK})\s?${NUMBER}|${NUMBER}\s?(€|£|(?:USD|CAD|AUD|GBP|EUR)\b)`,
  "gu",
);

/** Every amount written in a sentence, in cents, with the mark it was written with. */
export function amountsIn(sentence: string): { text: string; cents: Cents; mark: string }[] {
  return [...sentence.matchAll(AMOUNT)].map((m) => {
    const [mark, whole, fraction] = m[1] ? [m[1], m[2], m[3]] : [m[6], m[4], m[5]];
    return {
      text: m[0].trim(),
      cents: toCents(`${whole!.replaceAll(",", "")}${fraction ?? ""}`),
      mark: mark!,
    };
  });
}

/**
 * What code can check for sure, by sentence number: amounts (in the shop's currency, and in the
 * records), tracking numbers, cited IDs and the voice.
 */
export function codeChecks(
  sentences: CitedSentence[],
  facts: {
    ids: Set<string>;
    amounts: Set<Cents>;
    tracking: string | null;
    currency: CurrencyCode;
    toBuyer?: boolean;
  },
): Map<number, string> {
  const problems = new Map<number, string>();
  sentences.forEach((s, i) => {
    const issues: string[] = [];
    if (facts.toBuyer && ABOUT_THE_BUYER.test(s.sentence)) {
      issues.push("speaks about the buyer instead of to them");
    }
    if (s.sentence.includes("!")) issues.push("uses an exclamation mark");
    if (STOCK_PHRASES.test(s.sentence)) issues.push("uses a stock phrase instead of plain words");
    const unknown = s.evidence.filter((id) => !facts.ids.has(id));
    if (unknown.length) issues.push(`cites ${unknown.join(", ")}, which isn't in the case file`);
    for (const amount of amountsIn(s.sentence)) {
      if (!MARK_CURRENCIES.get(amount.mark)?.includes(facts.currency))
        issues.push(
          `writes ${amount.text}, which isn't in the shop's currency (${facts.currency})`,
        );
      else if (!facts.amounts.has(amount.cents))
        issues.push(
          `mentions ${formatMoney(amount.cents, facts.currency)}, which isn't an amount in the records`,
        );
    }
    for (const m of s.sentence.matchAll(/\b\d[\d ]{9,}\d\b/g)) {
      const digits = m[0].replaceAll(" ", "");
      if (facts.tracking && digits !== facts.tracking.replaceAll(" ", ""))
        issues.push(`gives a tracking number that isn't the order's`);
    }
    if (issues.length) problems.set(i + 1, issues.join("; "));
  });
  return problems;
}

function toVerification(
  sentences: CitedSentence[],
  verdict: Verdict,
  problems: Map<number, string>,
): Verification {
  const checked = sentences.map((s, i) => {
    const v = verdict.sentences.find((x) => x.index === i + 1);
    const supported = (v?.supported ?? false) && !problems.has(i + 1);
    return {
      sentence: s.sentence,
      evidence: v?.evidence.length ? [...new Set(v.evidence)] : s.evidence,
      supported,
    };
  });
  return { ok: checked.every((c) => c.supported), checked, notes: verdict.notes.trim() };
}

function flaggedIn(sentences: CitedSentence[], verdict: Verdict, problems: Map<number, string>) {
  return sentences.flatMap((s, i) => {
    const v = verdict.sentences.find((x) => x.index === i + 1);
    const problem = [
      v && !v.supported ? (v.problem ?? "not supported by the records") : null,
      problems.get(i + 1) ?? null,
    ]
      .filter(Boolean)
      .join("; ");
    return problem ? [{ index: i + 1, sentence: s.sentence, problem }] : [];
  });
}

async function check(
  run: Run,
  records: PromptRecord[],
  drafted: Drafted,
  recommendation: Recommendation,
) {
  const model = run.deps.models.decide;
  const { shop } = run.deps;
  const money = (cents: Cents) => formatMoney(cents, shop.currency);
  const ids = new Set(records.map((r) => r.id));
  const amounts = allowedAmounts(run, recommendation);
  const numbered = drafted.sentences
    .map(
      (s, i) => `${i + 1}. ${s.sentence}${s.evidence.length ? ` [${s.evidence.join(", ")}]` : ""}`,
    )
    .join("\n");
  const toBuyer = TO_BUYER[drafted.draft.kind];
  const audience = toBuyer
    ? `This draft goes to the buyer, ${run.kase.buyer.name}: it must speak to them as "you".`
    : "This draft goes to PayPal's reviewer: it may refer to the buyer as the buyer.";
  const content = [
    `The seller's move: ${MOVE_LABEL[recommendation.move]}.${recommendation.offerAmount ? ` The offer: ${money(recommendation.offerAmount)}.` : ""}`,
    audience,
    `Amounts that appear in the records, in the shop's currency: ${[...amounts].map(money).join(", ")}.`,
    `Evidence records:\n${evidenceBlock(records, shop.timeZone)}`,
    `The draft, one sentence per line, with the drafter's citations in brackets:\n${numbered}`,
    "Check every sentence and record the results.",
  ].join("\n\n");
  const verdict = await metered(run, "verify", model, TIMEOUTS.verify.deadline, async (signal) => {
    const a = await askForJson({
      client: run.client,
      model,
      system: verifySystem(),
      messages: [{ role: "user", content }],
      name: "record_check",
      description: "Record whether each sentence of the draft is supported by the evidence.",
      schema: verdictSchema(ids, drafted.sentences.length),
      // Measured 27 Oct on planted errors (a wrong date, an invented signature): Ultra caught both
      // either way, in 1.6 s for $0.002 without thinking and 4.6 s for $0.005 with it.
      thinking: false,
      maxTokens: 3000,
      signal,
      attemptTimeoutMs: TIMEOUTS.verify.attempt,
    });
    return { value: a.value, usage: a.usage };
  });
  const problems = codeChecks(drafted.sentences, {
    ids,
    amounts,
    tracking: run.order?.tracking?.number ?? null,
    currency: shop.currency,
    toBuyer,
  });
  return {
    verification: toVerification(drafted.sentences, verdict, problems),
    flagged: flaggedIn(drafted.sentences, verdict, problems),
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function verifyStep(
  run: Run,
  records: PromptRecord[],
  drafted: Drafted,
  recommendation: Recommendation,
): Promise<{ drafted: Drafted; verification: Verification }> {
  const model = run.deps.models.decide;
  run.emit({
    type: "step",
    step: "verify",
    state: "start",
    label: "Checking every sentence against the evidence",
    model,
  });
  try {
    let result = await check(run, records, drafted, recommendation);
    let fixed = 0;
    if (result.flagged.length > 0) {
      const n = result.flagged.length;
      run.emit({
        type: "tool",
        id: "verify-repair",
        label: `Rewriting ${plural(n, "unsupported sentence", "unsupported sentences")}`,
        state: "start",
      });
      try {
        const repaired = await repairDraft(run, drafted, result.flagged, records, recommendation);
        run.emit({
          type: "tool",
          id: "verify-repair",
          label: `Rewrote ${plural(n, "sentence", "sentences")}`,
          state: "done",
        });
        run.emit({
          type: "tool",
          id: "verify-recheck",
          label: "Checking the rewrite",
          state: "start",
        });
        const second = await check(run, records, repaired, recommendation);
        run.emit({
          type: "tool",
          id: "verify-recheck",
          label: second.verification.ok
            ? "The rewrite checks out"
            : "Some sentences still need your eye",
          state: "done",
        });
        fixed = n - second.flagged.length;
        drafted = repaired;
        result = second;
      } catch (error) {
        console.error("[analysis] repair failed", error);
        run.emit({
          type: "tool",
          id: "verify-repair",
          label: `Super VL ${failureReason(error)}; the flagged sentences are marked for you`,
          state: "error",
        });
      }
    }
    const open = result.verification.checked.filter((c) => !c.supported).length;
    const label = open
      ? `${plural(open, "sentence needs", "sentences need")} your review`
      : fixed > 0
        ? `Fixed ${plural(fixed, "sentence", "sentences")}; every sentence now matches the evidence`
        : "Every sentence checked against the evidence";
    run.emit({ type: "step", step: "verify", state: "done", label, model });
    return { drafted, verification: result.verification };
  } catch (error) {
    return stepFailed(
      run,
      "verify",
      model,
      error,
      `Ultra ${failureReason(error)}, so this draft is unchecked. Read it against the evidence before approving`,
      {
        drafted,
        verification: {
          ok: false,
          checked: drafted.sentences.map((s) => ({
            sentence: s.sentence,
            evidence: s.evidence,
            supported: false,
          })),
          notes:
            "Truce couldn't check this draft automatically. Read it against the evidence before approving.",
        },
      },
    );
  }
}
