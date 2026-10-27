"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CircleCheck, MessagesSquare, RotateCcw, Send, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Analysis, Case, CaseEvent, Draft, Move, Workspace } from "@/lib/domain";
import { approveCase } from "@/lib/client/actions";
import { errorMessage } from "@/lib/client/api";
import { openAsk } from "@/lib/client/ask";
import { formatDateTime } from "@/lib/client/format";
import { headlineWithoutMove, MOVE } from "@/lib/client/labels";
import { useNow } from "@/lib/client/now";
import { formatUsd } from "@/lib/money";
import { duration, ease, spring } from "../../motion";
import { Chip } from "../../ui/chip";
import { cn } from "../../ui/cn";
import { useToast } from "../../ui/toast";
import { MoveChip } from "../case-chips";
import { CostBars } from "./cost-bars";
import { EvidenceChip, EvidenceChips } from "./evidence";

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

function evidenceTypeLabel(type: string | undefined): string {
  if (!type) return "Evidence";
  const words = type.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function draftTitle(draft: Draft, kase: Case): string {
  const who = firstName(kase.buyer.name);
  switch (draft.kind) {
    case "message":
      return `Message to ${who}`;
    case "offer":
      return `Offer to ${who}${draft.offerAmount !== undefined ? `: ${formatUsd(draft.offerAmount)} back` : ""}`;
    case "evidence":
      return `For PayPal: ${evidenceTypeLabel(draft.evidenceType).toLowerCase()}`;
    case "refund":
      return `Full refund to ${who}`;
  }
}

function approveLabel(draft: Draft, kase: Case): string {
  switch (draft.kind) {
    case "message":
      return "Approve and send message";
    case "offer":
      return draft.offerAmount !== undefined
        ? `Approve and send ${formatUsd(draft.offerAmount)} offer`
        : "Approve and send offer";
    case "evidence":
      return "Approve and send evidence";
    case "refund":
      return `Approve ${formatUsd(kase.amount)} refund`;
  }
}

function whatHappens(move: Move, kase: Case): string {
  const who = firstName(kase.buyer.name);
  if (move === "refund") return `The money goes back to ${who} and the case closes.`;
  if (move === "settle")
    return `${who} can accept the offer in PayPal. If they do, the case closes with no dispute fee.`;
  if (kase.stage === "inquiry")
    return `${who} sees your reply in PayPal. If they close the case, it ends here with no fee.`;
  return "PayPal reviews what you sent and decides. Truce shows the decision here as soon as it lands.";
}

/** The right-hand column of the case file: the call, its reasons, the costs, the draft, and approve. */
export function RecommendationPanel({
  kase,
  analysis,
  events,
  workspace,
}: {
  kase: Case;
  analysis: Analysis;
  events: CaseEvent[];
  workspace: Workspace;
}) {
  const rec = analysis.recommendation;
  const [text, setText] = useState(analysis.draft.text);
  const [base, setBase] = useState(analysis.draft.text);
  const [phase, setPhase] = useState<"idle" | "sending" | "sent">("idle");
  const [noteReady, setNoteReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  // Let the approve button finish its check before the panel moves on.
  useEffect(() => {
    if (phase !== "sent") return;
    const timer = window.setTimeout(() => setNoteReady(true), 1300);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // A fresh analysis brings a fresh draft.
  if (analysis.draft.text !== base) {
    setBase(analysis.draft.text);
    setText(analysis.draft.text);
  }

  const approvedEvent = [...events]
    .reverse()
    .find((e) => e.kind === "approved" || e.kind === "sent");
  const decided = phase === "idle" ? kase.status !== "needs_you" : phase === "sent" && noteReady;
  const locked = phase !== "idle" || kase.status !== "needs_you";
  const edited = text.trim() !== analysis.draft.text.trim();

  async function approve() {
    setPhase("sending");
    setError(null);
    try {
      const response = await approveCase(kase, rec.move, { ...analysis.draft, text: text.trim() });
      setPhase("sent");
      toast({
        title: rec.move === "refund" ? "Refund approved" : "Approved and sent",
        description: response.simulated
          ? "Simulated in this demo copy, and recorded on the case."
          : response.paypal
            ? `PayPal answered ${response.paypal.status}.`
            : undefined,
      });
    } catch (e) {
      setPhase("idle");
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-4">
      {/* The call */}
      <section className="rounded-card border-line bg-paper overflow-hidden border">
        <div className="px-5 pt-5 pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink-2 text-[13px]">Truce recommends</span>
            <MoveChip move={rec.move} />
            {rec.move === "settle" && rec.offerAmount !== undefined && (
              <Chip tone="mist">Offer {formatUsd(rec.offerAmount)}</Chip>
            )}
            <span className="text-ink-2 ml-auto text-xs">
              {rec.confidence.charAt(0).toUpperCase() + rec.confidence.slice(1)} confidence
            </span>
          </div>
          <h2 className="text-ink mt-3 text-[19px] leading-snug font-semibold tracking-[-0.01em] text-pretty">
            {headlineWithoutMove(rec.headline)}
          </h2>
          <ol className="mt-4 space-y-2.5">
            {rec.reasons.map((reason, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: duration.base, ease: ease.out, delay: 0.05 + i * 0.05 }}
                className="text-ink flex gap-2.5 text-[14px] leading-relaxed"
              >
                <CircleCheck className="text-moss mt-[3px] size-4 shrink-0" />
                <span>
                  {reason.text}{" "}
                  {reason.evidence.map((id) => (
                    <EvidenceChip key={id} id={id} className="mr-1" />
                  ))}
                </span>
              </motion.li>
            ))}
          </ol>
        </div>
        <div className="border-line-soft border-t px-5 pt-4 pb-4">
          <CostBars options={analysis.options} recommended={rec.move} />
        </div>
      </section>

      {/* The draft, the check, and approve */}
      <section className="rounded-card border-line bg-paper overflow-hidden border">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
          <h3 className="text-ink text-[15px] font-semibold">{draftTitle(analysis.draft, kase)}</h3>
          <div className="flex items-center gap-2">
            {edited && !locked && (
              <button
                type="button"
                onClick={() => setText(analysis.draft.text)}
                className="text-ink-2 hover:text-ink inline-flex items-center gap-1 text-xs font-medium transition-colors"
              >
                <RotateCcw className="size-3" />
                Undo edits
              </button>
            )}
            <Chip tone={edited ? "warn" : "neutral"} size="sm">
              {phase === "sending"
                ? "Sending"
                : locked
                  ? approvedEvent || phase === "sent"
                    ? "Sent as approved"
                    : "Read only"
                  : edited
                    ? "Edited by you"
                    : "Truce's draft"}
            </Chip>
          </div>
        </div>
        <div className="px-5 pt-3">
          <DraftEditor value={text} onChange={setText} readOnly={locked} />
          {analysis.draft.evidenceIds.length > 0 && (
            <p className="text-ink-2 mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              Cites <EvidenceChips ids={analysis.draft.evidenceIds} />
            </p>
          )}
        </div>
        <div className="px-5 pt-4">
          <VerificationView analysis={analysis} edited={edited} />
        </div>

        <div className="border-line-soft bg-cream/50 mt-4 border-t px-5 py-4">
          <AnimatePresence mode="wait" initial={false}>
            {decided ? (
              <ApprovedNote
                key="done"
                kase={kase}
                move={rec.move}
                event={approvedEvent ?? null}
                workspace={workspace}
              />
            ) : (
              <motion.div
                key="approve"
                exit={{ opacity: 0, transition: { duration: duration.fast } }}
              >
                <ApproveButton
                  label={approveLabel(analysis.draft, kase)}
                  phase={phase}
                  onApprove={approve}
                />
                <p className="text-ink-2 mt-2.5 text-center text-xs leading-relaxed">
                  {workspace.kind === "demo"
                    ? "Simulated in this demo copy: recorded on the case, not sent to PayPal."
                    : "Sends to PayPal now, exactly as written above."}
                </p>
                {error && (
                  <p
                    role="alert"
                    className="bg-risk-50 text-risk-700 mt-3 rounded-[10px] px-3 py-2.5 text-[13px]"
                  >
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() =>
                    openAsk(
                      `For this case, what would happen if I chose a different move than ${MOVE[rec.move].toLowerCase()}?`,
                    )
                  }
                  className="text-moss hover:text-moss-deep mx-auto mt-3 flex items-center gap-1.5 text-xs font-medium transition-colors"
                >
                  <MessagesSquare className="size-3.5" />
                  Ask Truce about another move
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}

function DraftEditor({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <>
      <label htmlFor="draft" className="sr-only">
        The draft
      </label>
      <textarea
        id="draft"
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        rows={4}
        className={cn(
          "text-ink block w-full resize-none rounded-[10px] border px-3.5 py-3 text-[14px] leading-relaxed transition-[border-color,box-shadow,background-color] outline-none",
          readOnly
            ? "bg-cream border-transparent"
            : "border-line bg-paper hover:border-line-strong focus:border-moss focus:shadow-[0_0_0_3px_rgb(92_117_36/0.14)]",
        )}
      />
    </>
  );
}

function VerificationView({ analysis, edited }: { analysis: Analysis; edited: boolean }) {
  const v = analysis.verification;
  const supported = v.checked.filter((c) => c.supported).length;
  const [open, setOpen] = useState(!v.ok);
  return (
    <div
      className={cn(
        "rounded-[10px] border",
        v.ok ? "bg-mist/60 border-[#e3eab8]" : "border-warn-200 bg-warn-50",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left"
      >
        <span className="flex items-center gap-2.5">
          {v.ok ? (
            <span className="bg-lemon flex size-5 items-center justify-center rounded-full">
              <Check className="text-ink size-3" strokeWidth={3} />
            </span>
          ) : (
            <TriangleAlert className="text-warn-700 size-4" />
          )}
          <span className="text-ink text-[13px] font-medium">
            {v.ok ? "Every sentence checked against the evidence" : "Some sentences need a look"}
          </span>
        </span>
        <span className="text-ink-2 text-xs tabular-nums">
          {supported} of {v.checked.length} supported
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: duration.base, ease: ease.out }}
            className="overflow-hidden"
          >
            <ol className="space-y-2 px-3.5 pb-3">
              {v.checked.map((c, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed">
                  {c.supported ? (
                    <Check className="text-moss mt-1 size-3.5 shrink-0" strokeWidth={2.5} />
                  ) : (
                    <TriangleAlert className="text-warn-700 mt-1 size-3.5 shrink-0" />
                  )}
                  <span className={c.supported ? "text-ink" : "text-warn-700"}>
                    {c.sentence} <EvidenceChips ids={c.evidence} />
                  </span>
                </li>
              ))}
            </ol>
            {v.notes && (
              <p className="border-line-soft text-ink-2 border-t px-3.5 py-2.5 text-xs">
                {v.notes}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {edited && (
        <p className="border-line-soft text-ink-2 border-t px-3.5 py-2 text-xs">
          You&rsquo;ve edited the draft. Truce checked its own version; your changes go exactly as
          you wrote them.
        </p>
      )}
    </div>
  );
}

/** Approve: a press, a short send, then a check that draws itself with a soft ring. */
function ApproveButton({
  label,
  phase,
  onApprove,
}: {
  label: string;
  phase: "idle" | "sending" | "sent";
  onApprove: () => void;
}) {
  const sent = phase === "sent";
  return (
    <motion.button
      type="button"
      onClick={onApprove}
      disabled={phase !== "idle"}
      whileTap={{ scale: 0.98 }}
      animate={{
        backgroundColor: sent ? "#DDEB94" : "#1E2614",
        color: sent ? "#1E2614" : "#FAFBF3",
      }}
      transition={{ duration: duration.slow, ease: ease.out }}
      className="rounded-btn relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden text-[15px] font-medium disabled:cursor-default"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {phase === "idle" && (
          <motion.span key="idle" className="flex items-center gap-2" exit={{ opacity: 0, y: -10 }}>
            <Send className="size-4" />
            {label}
          </motion.span>
        )}
        {phase === "sending" && (
          <motion.span
            key="sending"
            className="flex items-center gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <span className="border-cream/30 border-t-cream size-4 animate-spin rounded-full border-2 motion-reduce:animate-none" />
            Sending
          </motion.span>
        )}
        {sent && (
          <motion.span
            key="sent"
            className="flex items-center gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="relative flex size-6 items-center justify-center">
              <motion.span
                className="bg-ink absolute inset-0 rounded-full"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={spring.pop}
              />
              <motion.span
                className="border-ink absolute inset-0 rounded-full border-2"
                initial={{ scale: 1, opacity: 0.5 }}
                animate={{ scale: 2.4, opacity: 0 }}
                transition={{ duration: 0.7, ease: ease.out, delay: 0.1 }}
              />
              <svg viewBox="0 0 16 16" className="relative size-3.5" aria-hidden>
                <motion.path
                  d="M3.5 8.5 L6.6 11.4 L12.5 4.8"
                  fill="none"
                  stroke="#DDEB94"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.35, ease: ease.out, delay: 0.15 }}
                />
              </svg>
            </span>
            Approved
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

function ApprovedNote({
  kase,
  move,
  event,
  workspace,
}: {
  kase: Case;
  move: Move;
  event: CaseEvent | null;
  workspace: Workspace;
}) {
  const now = useNow();
  const simulated = event?.simulated ?? workspace.kind === "demo";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.slow, ease: ease.out }}
      className="flex gap-3"
    >
      <motion.span
        initial={{ scale: 0.5 }}
        animate={{ scale: 1 }}
        transition={spring.pop}
        className="bg-lemon flex size-9 shrink-0 items-center justify-center rounded-full"
      >
        <Check className="text-ink size-4" strokeWidth={2.75} />
      </motion.span>
      <div className="min-w-0">
        <p className="text-ink text-sm font-semibold">
          {kase.status === "closed"
            ? "Done. This case is closed."
            : `You approved: ${MOVE[move].toLowerCase()}`}
        </p>
        <p className="text-ink-2 mt-0.5 text-[13px] leading-relaxed">
          {event ? `${formatDateTime(event.at, now)}. ` : ""}
          {kase.status === "closed" ? "The timeline has the whole story." : whatHappens(move, kase)}
        </p>
        {simulated && (
          <Chip tone="outline" size="sm" className="mt-2">
            Simulated in this demo copy
          </Chip>
        )}
      </div>
    </motion.div>
  );
}
