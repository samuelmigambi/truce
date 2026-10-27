"use client";

import { AnimatePresence, motion, useInView } from "motion/react";
import {
  Check,
  FileSearch,
  Gavel,
  MessageSquareText,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatUsd } from "@/lib/money";
import { costMoves } from "@/lib/rules/options";
import { duration, ease, spring } from "../motion";
import { Avatar } from "../ui/avatar";
import { Chip } from "../ui/chip";
import { cn } from "../ui/cn";
import { Typewriter } from "./typewriter";
import { useCalmMotion } from "../use-reduced-motion";

/**
 * The landing page's product preview: one real-shaped case moving through read, evidence,
 * recommend and approve. It loops while it's on screen, pauses on hover, and waits for clicks
 * when the visitor prefers less motion.
 */

const PHASES = [
  { id: "read", label: "Read", icon: MessageSquareText, ms: 3600 },
  { id: "evidence", label: "Evidence", icon: FileSearch, ms: 3600 },
  { id: "recommend", label: "Recommend", icon: Gavel, ms: 4000 },
  { id: "approve", label: "Approve", icon: Check, ms: 5600 },
] as const;

const COSTS = costMoves({
  amount: 8600,
  reason: "not_received",
  stage: "inquiry",
  protectedSale: true,
  highVolume: false,
  evidence: "strong",
});

const EVIDENCE = [
  { id: "E1", kind: "Tracking", text: "USPS: delivered 4 days ago, front porch" },
  { id: "E2", kind: "Payment", text: "Shipped to the address on the PayPal payment" },
  { id: "E3", kind: "Order", text: "Tracking was added to the PayPal order" },
  { id: "E4", kind: "Message", text: "Buyer says the candles never arrived" },
];

export function CasePreview({ className }: { className?: string }) {
  const reduced = useCalmMotion();
  const root = useRef<HTMLDivElement>(null);
  const inView = useInView(root, { amount: 0.35 });
  const [phase, setPhase] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [paused, setPaused] = useState(false);
  const [cycle, setCycle] = useState(0);
  const playing = !reduced && !paused && !hovered && inView;
  const current = PHASES[phase] ?? PHASES[0];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      const next = (phase + 1) % PHASES.length;
      if (next === 0) setCycle((c) => c + 1);
      setPhase(next);
    }, current.ms);
    return () => window.clearTimeout(timer);
  }, [playing, phase, current.ms]);

  return (
    <div
      ref={root}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={cn(
        "border-line bg-paper relative overflow-hidden rounded-[18px] border shadow-[0_1px_2px_rgb(30_38_20/0.05),0_30px_70px_-30px_rgb(30_38_20/0.3)]",
        className,
      )}
    >
      {/* Header */}
      <div className="border-line-soft flex items-center justify-between gap-3 border-b px-5 py-3">
        <p className="text-ink-3 truncate text-xs">
          Cases <span className="px-1">/</span> <span className="text-ink-2">PP-D-48121</span>
        </p>
        <div className="flex items-center gap-2">
          <Chip tone="mist" size="sm" dot>
            Demo copy
          </Chip>
          {!reduced && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Play the preview" : "Pause the preview"}
              className="text-ink-3 hover:bg-wash hover:text-ink flex size-6 items-center justify-center rounded-md transition-colors [&_svg]:size-3"
            >
              {paused ? <Play /> : <Pause />}
            </button>
          )}
        </div>
      </div>

      {/* Case facts */}
      <div className="flex items-start gap-3 px-5 pt-4">
        <Avatar name="Sam Rivera" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-ink truncate text-[15px] font-semibold">Sam Rivera</p>
            <p className="text-ink text-[15px] font-semibold tabular-nums">$86</p>
          </div>
          <p className="text-ink-2 truncate text-[13px]">Cedar &amp; Smoke candle trio · W-1042</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip size="sm">Not received</Chip>
            <Chip size="sm" tone="outline">
              Inquiry
            </Chip>
            <Chip size="sm" tone="neutral">
              Due in 8 days
            </Chip>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div
        role="tablist"
        aria-label="Preview steps"
        className="rounded-btn bg-ink/[0.045] mx-5 mt-4 grid grid-cols-4 gap-1 p-[3px]"
      >
        {PHASES.map((p, i) => {
          const Icon = p.icon;
          const active = i === phase;
          const done = i < phase;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPhase(i)}
              className={cn(
                "relative flex h-8 items-center justify-center gap-1.5 overflow-hidden rounded-[8px] text-xs font-medium transition-colors",
                active ? "text-ink" : done ? "text-ink-2" : "text-ink-3 hover:text-ink-2",
              )}
            >
              {active && (
                <motion.span
                  layoutId="preview-step"
                  transition={spring.snappy}
                  className="bg-lemon absolute inset-0 rounded-[8px]"
                />
              )}
              {active && playing && (
                <motion.span
                  key={`${cycle}-${phase}`}
                  className="bg-ink/25 absolute inset-x-0 bottom-0 h-[2px] origin-left"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: p.ms / 1000, ease: "linear" }}
                />
              )}
              <span className="relative flex items-center gap-1.5 [&_svg]:size-3.5">
                {done ? <Check className="text-moss" strokeWidth={2.5} /> : <Icon />}
                <span className="max-sm:hidden">{p.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Phase body */}
      <div className="relative h-[316px] px-5 pt-4 pb-5 sm:h-[264px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${current.id}-${cycle}`}
            role="tabpanel"
            aria-label={current.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.out } }}
            exit={{ opacity: 0, y: -4, transition: { duration: duration.fast, ease: ease.in } }}
            className="h-full"
          >
            {current.id === "read" && <ReadPhase />}
            {current.id === "evidence" && <EvidencePhase />}
            {current.id === "recommend" && <RecommendPhase />}
            {current.id === "approve" && <ApprovePhase still={Boolean(reduced)} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function ModelTag({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn("text-ink-3 inline-flex items-center gap-1 text-[11px] font-medium", className)}
    >
      <Sparkles className="size-3" />
      Nemotron {name}
    </span>
  );
}

const appear = (delay: number) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.out, delay } },
});

function ReadPhase() {
  return (
    <div className="flex h-full flex-col gap-4">
      <motion.div
        {...appear(0.05)}
        className="bg-mist max-w-[86%] rounded-[12px] rounded-tl-[4px] px-3.5 py-2.5"
      >
        <p className="text-ink text-[13px] leading-relaxed">
          &ldquo;My candles never arrived. It&rsquo;s been over a week.&rdquo;
        </p>
        <p className="text-ink-2 mt-1 text-[11px]">Sam Rivera, 2 days ago</p>
      </motion.div>
      <motion.div {...appear(0.45)} className="rounded-card border-line-soft border p-3.5">
        <div className="flex items-center justify-between">
          <p className="text-ink text-xs font-medium">Truce&rsquo;s read</p>
          <ModelTag name="Lightning" />
        </div>
        <p className="text-ink-2 mt-1.5 min-h-[66px] text-[13px] leading-relaxed">
          <Typewriter
            delay={0.7}
            cps={80}
            text="An item-not-received inquiry for $86. USPS shows it delivered 4 days ago, so it may be on a porch or with a neighbor. 8 days left to reply."
          />
        </p>
      </motion.div>
    </div>
  );
}

function EvidencePhase() {
  return (
    <div className="flex h-full flex-col">
      <ul className="space-y-1.5">
        {EVIDENCE.map((e, i) => (
          <motion.li
            key={e.id}
            {...appear(0.1 + i * 0.32)}
            className="border-line-soft flex items-center gap-2.5 rounded-[10px] border px-3 py-2"
          >
            <span className="bg-ink text-lemon inline-flex h-5 items-center rounded-[6px] px-1.5 text-[10px] font-semibold tabular-nums">
              {e.id}
            </span>
            <span className="text-ink-3 w-16 shrink-0 text-[11px] font-medium">{e.kind}</span>
            <span className="text-ink min-w-0 flex-1 truncate text-[13px]">{e.text}</span>
            {i < 3 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1, transition: { ...spring.pop, delay: 0.3 + i * 0.32 } }}
                className="bg-lemon flex size-4 items-center justify-center rounded-full"
              >
                <Check className="text-ink size-2.5" strokeWidth={3} />
              </motion.span>
            )}
          </motion.li>
        ))}
      </ul>
      <motion.div
        {...appear(1.55)}
        className="bg-mist mt-auto flex items-center justify-between rounded-[10px] px-3 py-2.5"
      >
        <span className="text-ink flex items-center gap-2 text-[13px] font-medium">
          <ShieldCheck className="text-moss size-4" />
          Seller Protection covers this case
        </span>
        <span className="text-ink-2 text-[11px]">Checked in code</span>
      </motion.div>
    </div>
  );
}

function RecommendPhase() {
  const max = Math.max(...COSTS.map((c) => c.worst));
  const labels = { fight: "Fight", settle: "Settle", refund: "Refund" } as const;
  return (
    <div className="flex h-full flex-col">
      <motion.div {...appear(0.05)} className="flex items-center gap-2">
        <Chip tone="ink" size="sm">
          Fight
        </Chip>
        <span className="text-ink-2 text-[11px] font-medium">High confidence</span>
        <ModelTag name="Ultra" className="ml-auto" />
      </motion.div>
      <motion.p {...appear(0.2)} className="text-ink mt-2 text-[15px] leading-snug font-semibold">
        Tracking shows it was delivered to the PayPal address.{" "}
        <span className="inline-flex translate-y-[-1px] gap-1 align-middle">
          <EvidenceTag id="E1" />
          <EvidenceTag id="E2" />
        </span>
      </motion.p>
      <motion.div
        {...appear(0.45)}
        className="rounded-card border-line-soft mt-auto space-y-2.5 border p-3.5"
      >
        <p className="text-ink-3 flex justify-between text-[11px] font-medium">
          <span>Expected cost</span>
          <span>Fees included</span>
        </p>
        {COSTS.map((c, i) => (
          <div key={c.move} className="grid grid-cols-[56px_1fr_52px] items-center gap-3">
            <span
              className={cn("text-xs font-medium", c.move === "fight" ? "text-ink" : "text-ink-2")}
            >
              {labels[c.move]}
            </span>
            <div className="bg-ink/[0.06] h-2 overflow-hidden rounded-full">
              <motion.div
                className={cn(
                  "h-full origin-left rounded-full",
                  c.move === "fight" ? "bg-moss" : "bg-ink/25",
                )}
                style={{ width: `${Math.max(3, (c.expected / max) * 100)}%` }}
                initial={{ scaleX: 0 }}
                animate={{
                  scaleX: 1,
                  transition: {
                    duration: duration.slower + 0.2,
                    ease: ease.out,
                    delay: 0.6 + i * 0.12,
                  },
                }}
              />
            </div>
            <span
              className={cn(
                "text-right text-xs tabular-nums",
                c.move === "fight" ? "text-ink font-semibold" : "text-ink-2",
              )}
            >
              {formatUsd(c.expected)}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

function EvidenceTag({ id }: { id: string }) {
  return (
    <span className="bg-mist text-moss-deep inline-flex h-[18px] items-center rounded-[5px] px-1 text-[10px] font-semibold tabular-nums">
      {id}
    </span>
  );
}

function ApprovePhase({ still }: { still: boolean }) {
  const [step, setStep] = useState(still ? 3 : 0);

  useEffect(() => {
    if (still) return;
    const timers = [
      window.setTimeout(() => setStep(1), 2100),
      window.setTimeout(() => setStep(2), 2500),
      window.setTimeout(() => setStep(3), 3900),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [still]);

  const sent = step >= 2;
  return (
    <div className="flex h-full flex-col">
      <motion.div {...appear(0.05)} className="rounded-card border-line-soft border p-3.5">
        <p className="text-ink-3 flex items-center justify-between text-[11px] font-medium">
          <span>Message to Sam</span>
          <span>Nemotron Super VL</span>
        </p>
        <p className="text-ink mt-1.5 min-h-[60px] text-[13px] leading-relaxed">
          <Typewriter
            cps={110}
            delay={0.25}
            text="Hi Sam, thanks for getting in touch. USPS shows your order was delivered 4 days ago to the address on your PayPal payment. Could you check with neighbors?"
          />
        </p>
        <p className="border-line-soft text-moss-deep mt-2 flex items-center gap-1.5 border-t pt-2 text-[11px]">
          <Check className="size-3" strokeWidth={2.5} />
          Every sentence checked against the evidence
        </p>
      </motion.div>

      <div className="mt-auto flex items-center gap-3">
        <motion.div
          layout
          transition={spring.layout}
          className={cn(
            "rounded-btn relative flex h-10 items-center justify-center gap-2 overflow-hidden px-4 text-sm font-medium",
            sent ? "bg-lemon text-ink" : "bg-ink text-cream",
          )}
          animate={{ scale: step === 1 ? 0.96 : 1 }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {sent ? (
              <motion.span
                key="sent"
                className="flex items-center gap-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <motion.span
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0, transition: spring.pop }}
                  className="bg-ink flex size-5 items-center justify-center rounded-full"
                >
                  <Check className="text-lemon size-3" strokeWidth={3} />
                </motion.span>
                Sent
              </motion.span>
            ) : (
              <motion.span key="approve" exit={{ opacity: 0, y: -8 }}>
                Approve and send
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
        <AnimatePresence mode="wait">
          {step === 2 && (
            <motion.span key="waiting" {...appear(0)} exit={{ opacity: 0 }}>
              <Chip tone="outline" dot>
                Waiting on buyer
              </Chip>
            </motion.span>
          )}
          {step === 3 && (
            <motion.span key="closed" {...appear(0)} className="flex items-center gap-2">
              <Chip tone="lemon">Buyer closed the case</Chip>
              <span className="text-ink text-xs font-medium tabular-nums">Kept $86</span>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
