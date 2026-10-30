"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ChevronDown,
  CircleCheck,
  Hourglass,
  PlugZap,
  RotateCcw,
  Send,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ApproveResponse } from "@/lib/api-types";
import type { Analysis, Case, CaseEvent, Draft, Move } from "@/lib/domain";
import type { Cents } from "@/lib/money";
import { approveCase } from "@/lib/client/actions";
import { errorMessage, shopHref } from "@/lib/client/api";
import { headlineWithoutMove, MOVE, reviewAction, sendBlocker } from "@/lib/client/labels";
import { useMoney, useShop, useShopDates } from "@/lib/client/shop-context";
import { duration, ease, spring } from "../../motion";
import { Button, IconButton } from "../../ui/button";
import { Chip } from "../../ui/chip";
import { cn } from "../../ui/cn";
import { useToast } from "../../ui/toast";
import { MoveChip } from "../case-chips";
import { CostTable } from "./cost-table";
import { EvidenceChip, EvidenceChips } from "./evidence";

type Format = (cents: Cents) => string;
type ReviewAction = ReturnType<typeof reviewAction>;

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

function evidenceTypeLabel(type: string | undefined): string {
  if (!type) return "Evidence";
  const words = type.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function draftTitle(draft: Draft, kase: Case, money: Format): string {
  const who = firstName(kase.buyer.name);
  switch (draft.kind) {
    case "message":
      return `Message to ${who}`;
    case "offer":
      return `Offer to ${who}${draft.offerAmount !== undefined ? `: ${money(draft.offerAmount)} back` : ""}`;
    case "evidence":
      return `For PayPal: ${evidenceTypeLabel(draft.evidenceType).toLowerCase()}`;
    case "refund":
      return `Full refund to ${who}`;
  }
}

function approveLabel(draft: Draft, kase: Case, money: Format, review: ReviewAction): string {
  if (review === "provide_supporting_info") return "Send to PayPal";
  switch (draft.kind) {
    case "message":
      return "Approve and send message";
    case "offer":
      return draft.offerAmount !== undefined
        ? `Approve and send ${money(draft.offerAmount)} offer`
        : "Approve and send offer";
    case "evidence":
      return "Approve and send evidence";
    case "refund":
      return `Approve ${money(kase.amount)} refund`;
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
  onRunAgain,
}: {
  kase: Case;
  analysis: Analysis;
  events: CaseEvent[];
  /** Reads the case again from the start, while it still needs the seller. */
  onRunAgain?: () => void;
}) {
  const shop = useShop();
  const money = useMoney();
  const rec = analysis.recommendation;
  const [text, setText] = useState(analysis.draft.text);
  const [base, setBase] = useState(analysis.draft.text);
  const [phase, setPhase] = useState<"idle" | "sending" | "sent">("idle");
  const [noteReady, setNoteReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<ApproveResponse["paypal"]>(null);
  const toast = useToast();
  const blocked = sendBlocker(shop);
  // A real claim PayPal is reviewing can still take supporting information (or a refund).
  const review = reviewAction(shop, kase, rec.move);

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
  // Already sent since this analysis: the reviewer has it, so it isn't offered twice.
  const sentSince = approvedEvent !== undefined && approvedEvent.at >= analysis.createdAt;
  const open = kase.status === "needs_you" || (review !== null && !sentSince);
  const decided = phase === "idle" ? !open : phase === "sent" && noteReady;
  const locked = phase !== "idle" || !open;
  const edited = text.trim() !== analysis.draft.text.trim();

  async function approve() {
    if (blocked) return;
    setPhase("sending");
    setError(null);
    try {
      const response = await approveCase(shop.id, kase, rec.move, {
        ...analysis.draft,
        text: text.trim(),
      });
      setPhase("sent");
      setAnswer(response.paypal);
      toast({
        title: rec.move === "refund" ? "Refund approved" : "Approved and sent",
        description: response.simulated
          ? "Simulated in this sample shop, and recorded on the case."
          : response.paypal
            ? "PayPal received it, and it's recorded on the case."
            : "Sent to PayPal, and recorded on the case.",
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
        <div className="p-5">
          {/* On a narrow screen the chips wrap; the run-again button keeps its place on the right. */}
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <MoveChip move={rec.move} />
              {rec.move === "settle" && rec.offerAmount !== undefined && (
                <Chip tone="mist">Offer {money(rec.offerAmount)}</Chip>
              )}
              <Chip tone="outline" className="ml-auto">
                {rec.confidence.charAt(0).toUpperCase() + rec.confidence.slice(1)} confidence
              </Chip>
            </div>
            {onRunAgain && (
              <IconButton
                label="Run the analysis again"
                size="sm"
                onClick={onRunAgain}
                className="-my-1 -mr-1.5"
              >
                <RotateCcw />
              </IconButton>
            )}
          </div>
          <h2 className="text-ink mt-4 text-[20px] leading-snug font-semibold tracking-[-0.015em] text-pretty">
            <span className="sr-only">Truce recommends: {MOVE[rec.move].toLowerCase()}. </span>
            {headlineWithoutMove(rec.headline)}
          </h2>
          <ol className="mt-4 space-y-3">
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
        <div className="border-line-soft border-t px-5 pt-4 pb-5">
          <CostTable options={analysis.options} recommended={rec.move} />
        </div>
      </section>

      {/* The draft, the check, and approve */}
      <section className="rounded-card border-line bg-paper overflow-hidden border">
        <div className="flex min-h-8 items-center justify-between gap-3 px-5 pt-4">
          <h3 className="text-ink text-[15px] font-semibold">
            {draftTitle(analysis.draft, kase, money)}
          </h3>
          {edited && !locked && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setText(analysis.draft.text)}
              className="-my-1 -mr-2"
            >
              Undo edits
            </Button>
          )}
        </div>
        <div className="px-5 pt-3">
          <DraftEditor value={text} onChange={setText} readOnly={locked} />
        </div>
        <div className="px-5 pt-3">
          <VerificationView analysis={analysis} edited={edited} />
        </div>

        <div className="border-line-soft bg-cream/50 mt-5 border-t px-5 py-4">
          <AnimatePresence mode="wait" initial={false}>
            {decided ? (
              <ApprovedNote
                key="done"
                kase={kase}
                move={rec.move}
                event={approvedEvent ?? null}
                approvedHere={phase === "sent"}
                answer={answer}
              />
            ) : (
              <motion.div
                key="approve"
                exit={{ opacity: 0, transition: { duration: duration.fast } }}
              >
                {review && kase.status === "with_paypal" && (
                  <p className="border-line bg-paper text-ink mb-3 flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3 text-[13.5px] leading-relaxed">
                    <Hourglass className="text-ink-2 mt-[3px] size-3.5 shrink-0" aria-hidden />
                    <span>
                      PayPal is reviewing this claim.{" "}
                      {review === "accept_claim"
                        ? `You can still accept it, which refunds ${firstName(kase.buyer.name)} in full and closes the case.`
                        : review === "provide_evidence"
                          ? "You can still send this to the reviewer as evidence."
                          : "You can still send this to the reviewer as supporting information."}
                    </span>
                  </p>
                )}
                <ApproveButton
                  label={approveLabel(analysis.draft, kase, money, review)}
                  phase={phase}
                  onApprove={approve}
                  disabled={blocked !== null}
                />
                {blocked ? (
                  <p className="border-warn-200 bg-warn-50 text-warn-700 mt-3 flex items-start gap-2 rounded-[10px] border px-3 py-2.5 text-[13px] leading-relaxed">
                    <PlugZap className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>
                      {blocked}{" "}
                      <Link
                        href={shopHref(shop.id, "settings#paypal")}
                        className="font-medium underline underline-offset-4"
                      >
                        Open settings
                      </Link>
                    </span>
                  </p>
                ) : shop.kind === "sample" ? (
                  <p className="text-ink-2 mt-3 text-center text-[13px] leading-relaxed">
                    Sample shop: recorded on the case, not sent to PayPal.
                  </p>
                ) : null}
                {error && (
                  <p
                    role="alert"
                    className="bg-risk-50 text-risk-700 mt-3 rounded-[10px] px-3 py-2.5 text-[13px]"
                  >
                    {error}
                  </p>
                )}
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
  // The box grows with the draft, and again when the screen's width changes (a phone turning).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    fit();
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
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

function verdict(ok: boolean, flagged: number): string {
  if (ok) return "Every sentence matches the evidence";
  if (flagged === 0) return "Some sentences need a look";
  return `${flagged} ${flagged === 1 ? "sentence needs" : "sentences need"} a look`;
}

function VerificationView({ analysis, edited }: { analysis: Analysis; edited: boolean }) {
  const v = analysis.verification;
  const flagged = v.checked.filter((c) => !c.supported).length;
  const [open, setOpen] = useState(!v.ok);
  return (
    <div
      className={cn(
        "rounded-[10px] border",
        v.ok ? "bg-mist/60 border-mist-line" : "border-warn-200 bg-warn-50",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-2.5 px-3.5 py-3 text-left"
      >
        {v.ok ? (
          <span className="bg-lemon mt-px flex size-5 shrink-0 items-center justify-center rounded-full">
            <Check className="text-ink size-3" strokeWidth={3} />
          </span>
        ) : (
          <TriangleAlert className="text-warn-700 mt-0.5 size-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1">
          <span className="text-ink block text-[13.5px] leading-5 font-medium">
            {verdict(v.ok, flagged)}
          </span>
          {edited && (
            <span className="text-ink-2 mt-0.5 block text-[13px] leading-5">
              Checked before your edits. Yours go exactly as you wrote them.
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "text-ink-2 mt-0.5 size-4 shrink-0 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
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
              <p className="border-line-soft text-ink-2 border-t px-3.5 py-2.5 text-[13px] leading-relaxed">
                {v.notes}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Approve: a press, a short send, then a check that draws itself with a soft ring. */
function ApproveButton({
  label,
  phase,
  onApprove,
  disabled = false,
}: {
  label: string;
  phase: "idle" | "sending" | "sent";
  onApprove: () => void;
  /** Nothing can be sent right now (PayPal isn't connected). */
  disabled?: boolean;
}) {
  const sent = phase === "sent";
  return (
    <motion.button
      type="button"
      onClick={onApprove}
      disabled={phase !== "idle" || disabled}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      className={cn(
        "rounded-btn relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden text-[15px] font-medium transition-colors duration-300 disabled:cursor-default",
        sent ? "bg-lemon text-on-lemon" : "bg-ink text-cream",
        disabled && phase === "idle" && "opacity-45",
      )}
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
                className="bg-forest absolute inset-0 rounded-full"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={spring.pop}
              />
              <motion.span
                className="border-forest absolute inset-0 rounded-full border-2"
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

/** Where a case that doesn't need the seller stands, when nobody approved anything in Truce. */
function waitingNote(kase: Case): { title: string; body: string } {
  const who = firstName(kase.buyer.name);
  if (kase.status === "closed") {
    return { title: "This case is closed", body: "The timeline has the whole story." };
  }
  if (kase.status === "with_paypal") {
    return {
      title: "PayPal is reviewing this claim",
      body: "There's nothing to send right now. Truce shows PayPal's decision here as soon as it lands.",
    };
  }
  return {
    title: `Waiting on ${who}`,
    body: `There's nothing to send right now. Truce tells you as soon as ${who} replies.`,
  };
}

function ApprovedNote({
  kase,
  move,
  event,
  approvedHere,
  answer,
}: {
  kase: Case;
  move: Move;
  /** The approval on the case's record, if there is one. */
  event: CaseEvent | null;
  /** The seller approved on this screen just now. */
  approvedHere: boolean;
  /** What PayPal said, when this screen made the call. */
  answer: ApproveResponse["paypal"];
}) {
  const shop = useShop();
  const dates = useShopDates();
  const approved = approvedHere || event !== null;
  const simulated = approved && (event?.simulated ?? shop.kind === "sample");
  const waiting = approved ? null : waitingNote(kase);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.slow, ease: ease.out }}
      className="flex gap-3"
      role="status"
    >
      <motion.span
        initial={{ scale: 0.5 }}
        animate={{ scale: 1 }}
        transition={spring.pop}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          waiting ? "bg-ink/[0.06] text-ink-2" : "bg-lemon text-ink",
        )}
      >
        {waiting ? (
          kase.status === "closed" ? (
            <Check className="size-4" strokeWidth={2.75} />
          ) : (
            <Hourglass className="size-4" />
          )
        ) : (
          <Check className="size-4" strokeWidth={2.75} />
        )}
      </motion.span>
      <div className="min-w-0">
        <p className="text-ink text-sm font-semibold">
          {waiting
            ? waiting.title
            : kase.status === "closed"
              ? "Done. This case is closed."
              : `You approved: ${MOVE[move].toLowerCase()}`}
        </p>
        <p className="text-ink-2 mt-0.5 text-[13px] leading-relaxed">
          {waiting ? (
            waiting.body
          ) : (
            <>
              {event ? `${dates.dateTime(event.at)}. ` : ""}
              {kase.status === "closed"
                ? "The timeline has the whole story."
                : whatHappens(move, kase)}
            </>
          )}
        </p>
        {simulated ? (
          <Chip tone="outline" size="sm" className="mt-2">
            Simulated in this sample shop
          </Chip>
        ) : answer ? (
          <Chip
            tone="moss"
            size="sm"
            className="mt-2"
            title={`${answer.status} · ${answer.endpoint}`}
          >
            Received by PayPal
          </Chip>
        ) : null}
      </div>
    </motion.div>
  );
}
