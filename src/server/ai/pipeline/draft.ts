import "server-only";

import type {
  ChatCompletionChunk,
  ChatCompletionContentPart,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";
import type { DisputeReason, DisputeStage, Draft, Move, Order, Recommendation } from "@/lib/domain";
import { formatUsd } from "@/lib/money";
import { CitationFilter, splitCitations, type CitedSentence } from "../citations";
import { formatDay } from "../dates";
import { requestOptions, ThinkFilter } from "../loop";
import { reasoningParams, type Usage } from "../models";
import {
  caseBlock,
  draftSystem,
  evidenceBlock,
  MOVE_LABEL,
  repairSystem,
  type DraftKind,
  type PromptRecord,
} from "../prompts";
import { addressLine } from "./evidence";
import type { Gathered } from "./gather";
import { failureReason, metered, stepFailed, TIMEOUTS } from "./run";
import type { Run } from "./types";

/**
 * Drafting on Super VL, which also sees the buyer's photos. The text streams to the app as it's
 * written, with the evidence marks taken out; the marks are kept per sentence for the check.
 */

export function draftKind(move: Move, stage: DisputeStage): DraftKind {
  if (move === "settle") return "offer";
  if (move === "refund") return "refund";
  return stage === "inquiry" ? "message" : "evidence";
}

/** PayPal's evidence_type for the evidence a fight sends. */
export function evidenceType(reason: DisputeReason, order: Order | null): string {
  return (reason === "not_received" || reason === "unauthorized") && order?.tracking
    ? "PROOF_OF_FULFILLMENT"
    : "OTHER";
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export interface Drafted {
  draft: Draft;
  sentences: CitedSentence[];
  /** The text with its marks, as written. */
  raw: string;
}

/** The Draft from a written text: its cited IDs, the offer, PayPal's evidence type. */
/** The shop's voice is calm: an exclamation mark becomes a full stop, while streaming and after. */
export function calm(text: string): string {
  return text.replace(/\?!+/g, "?").replace(/!+/g, ".");
}

export function toDraft(
  run: Run,
  kind: DraftKind,
  raw: string,
  records: PromptRecord[],
  recommendation: Recommendation,
): Drafted {
  const { text, sentences } = splitCitations(calm(raw));
  const known = new Set(records.map((r) => r.id));
  const evidenceIds = [...new Set(sentences.flatMap((s) => s.evidence))].filter((id) =>
    known.has(id),
  );
  const draft: Draft = {
    kind,
    text,
    evidenceIds,
    ...(kind === "offer" && recommendation.offerAmount
      ? { offerAmount: recommendation.offerAmount }
      : {}),
    ...(kind === "evidence" ? { evidenceType: evidenceType(run.kase.reason, run.order) } : {}),
  };
  return { draft, sentences, raw };
}

const LABEL: Record<DraftKind, (first: string) => string> = {
  message: (first) => `Writing the reply to ${first}`,
  offer: (first) => `Writing the offer to ${first}`,
  evidence: () => "Writing the evidence notes for PayPal",
  refund: (first) => `Writing the refund note to ${first}`,
};

function briefFor(
  run: Run,
  records: PromptRecord[],
  recommendation: Recommendation,
  photos: number,
): string {
  const reasons = recommendation.reasons
    .map((r) => `- ${r.text} [${r.evidence.join(", ")}]`)
    .join("\n");
  return [
    caseBlock(run.kase, run.now),
    `The seller's move: ${MOVE_LABEL[recommendation.move]}. ${recommendation.headline}`,
    `Why:\n${reasons}`,
    recommendation.offerAmount
      ? `The partial refund offered: ${formatUsd(recommendation.offerAmount)}.`
      : "",
    `Evidence records:\n${evidenceBlock(records)}`,
    photos
      ? "The buyer's photos are attached. Mention what they show only as the photo records describe it."
      : "",
    "Write the draft now.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function streamDraft(
  run: Run,
  model: string,
  system: string,
  content: ChatCompletionContentPart[],
  signal: AbortSignal,
): Promise<{ value: string; usage: Usage | null }> {
  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
    max_tokens: 900,
    stream: true,
    stream_options: { include_usage: true },
    ...reasoningParams(false),
  } as ChatCompletionCreateParamsStreaming;
  const stream = await run.client.chat.completions.create(
    body,
    requestOptions(signal, TIMEOUTS.draft.attempt),
  );
  const marks = new CitationFilter();
  const think = new ThinkFilter();
  let raw = "";
  let usage: Usage | null = null;
  const show = (text: string) => {
    if (text) run.emit({ type: "text", step: "draft", delta: calm(text) });
  };
  for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
    if (chunk.usage) usage = chunk.usage;
    const delta = chunk.choices[0]?.delta?.content;
    if (!delta) continue;
    const visible = think.push(delta);
    raw += visible;
    show(marks.push(visible));
  }
  const rest = think.flush();
  raw += rest;
  show(marks.push(rest) + marks.flush());
  return { value: raw, usage };
}

/** A plain draft from the records alone, for when the model can't be reached. */
export function templateDraft(
  run: Run,
  kind: DraftKind,
  records: PromptRecord[],
  recommendation: Recommendation,
): string {
  const first = firstName(run.kase.buyer.name);
  const shop = run.deps.workspace.shopName;
  const id = (kind: string) => records.find((r) => r.kind === kind)?.id;
  const mark = (...ids: (string | undefined)[]) => {
    const found = ids.filter((x): x is string => !!x);
    return found.length ? ` [${found.join(", ")}]` : "";
  };
  const t = run.order?.tracking;
  const delivered = t?.deliveredAt ? formatDay(t.deliveredAt) : null;
  const sign = `\n\nWarm regards,\n${shop}`;
  switch (kind) {
    case "message":
      return delivered
        ? `Hi ${first},\n\nThank you for letting us know. Our tracking shows the order was delivered on ${delivered}${mark(id("tracking"))}. It went to ${addressLine(run.order?.shipTo ?? null)}, the address on your PayPal payment${mark(id("payment"))}. Could you check around your door and with neighbors? If it still hasn't turned up, reply here and we'll look into it with you.${sign}`
        : `Hi ${first},\n\nThank you for letting us know. We're looking into your order with the carrier and will reply here shortly.${sign}`;
    case "offer":
      return `Hi ${first},\n\nThank you for your message, and we're sorry it wasn't what you expected. The listing states the size and details of the item${mark(id("listing"))}. We'd like to offer a partial refund of ${formatUsd(recommendation.offerAmount ?? 0)}, and you keep the item.${sign}`;
    case "refund":
      return `Hi ${first},\n\nWe're sorry about your order. We're refunding the full ${formatUsd(run.kase.amount)} to your PayPal account${mark(id("payment"))}. Thank you for your patience.${sign}`;
    case "evidence":
      return [
        run.order
          ? `Order ${run.order.id} for ${formatUsd(run.order.amount)} was paid through PayPal${mark(id("order"), id("payment"))}.`
          : "",
        t ? `It shipped with ${t.carrier} tracking ${t.number}${mark(id("tracking"))}.` : "",
        delivered ? `${t!.carrier} shows it delivered on ${delivered}${mark(id("tracking"))}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
  }
}

export async function draftStep(
  run: Run,
  records: PromptRecord[],
  gathered: Gathered,
  recommendation: Recommendation,
): Promise<Drafted> {
  const model = run.deps.models.draft;
  const kind = draftKind(recommendation.move, run.kase.stage);
  run.emit({
    type: "step",
    step: "draft",
    state: "start",
    label: LABEL[kind](firstName(run.kase.buyer.name)),
    model,
  });
  const system = draftSystem(
    run.deps.workspace.shopName,
    kind,
    run.kase.amount,
    recommendation.offerAmount ?? null,
  );
  const content: ChatCompletionContentPart[] = [
    { type: "text", text: briefFor(run, records, recommendation, gathered.photos.length) },
    ...gathered.photos.map((p) => ({ type: "image_url" as const, image_url: { url: p.dataUrl } })),
  ];
  try {
    const raw = await metered(run, "draft", model, TIMEOUTS.draft.deadline, (signal) =>
      streamDraft(run, model, system, content, signal),
    );
    const drafted = toDraft(run, kind, raw, records, recommendation);
    if (drafted.draft.text.length < 20) throw new Error("The draft came back empty");
    const words = drafted.draft.text.split(/\s+/).length;
    run.emit({
      type: "step",
      step: "draft",
      state: "done",
      label: `Draft ready · ${words} words`,
      model,
    });
    return drafted;
  } catch (error) {
    return stepFailed(
      run,
      "draft",
      model,
      error,
      `Super VL ${failureReason(error)}, so this is a plain template from the records. Edit it before approving`,
      toDraft(
        run,
        kind,
        templateDraft(run, kind, records, recommendation),
        records,
        recommendation,
      ),
    );
  }
}

/** One rewrite of the flagged sentences, on the same model that drafted them. */
export async function repairDraft(
  run: Run,
  drafted: Drafted,
  flagged: { index: number; sentence: string; problem: string }[],
  records: PromptRecord[],
  recommendation: Recommendation,
): Promise<Drafted> {
  const model = run.deps.models.draft;
  const content = [
    `The seller's move: ${MOVE_LABEL[recommendation.move]}.${recommendation.offerAmount ? ` The offer: ${formatUsd(recommendation.offerAmount)}.` : ""}`,
    `Evidence records:\n${evidenceBlock(records)}`,
    `The draft:\n${drafted.raw.trim()}`,
    `Flagged sentences:\n${flagged.map((f) => `- "${f.sentence}": ${f.problem}`).join("\n")}`,
    "Reply with the whole corrected draft.",
  ].join("\n\n");
  const raw = await metered(run, "draft", model, TIMEOUTS.repair.deadline, async (signal) => {
    const response = await run.client.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: repairSystem(run.deps.workspace.shopName) },
          { role: "user", content },
        ],
        max_tokens: 900,
        ...reasoningParams(false),
      },
      requestOptions(signal, TIMEOUTS.repair.attempt),
    );
    const think = new ThinkFilter();
    const text = think.push(response.choices[0]?.message.content ?? "") + think.flush();
    return { value: text, usage: response.usage ?? null };
  });
  const repaired = toDraft(run, drafted.draft.kind, raw, records, recommendation);
  if (repaired.draft.text.length < 20) throw new Error("The rewrite came back empty");
  return repaired;
}
