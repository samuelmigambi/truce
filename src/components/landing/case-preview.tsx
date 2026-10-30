"use client";

import { AnimatePresence, motion, useInView } from "motion/react";
import { Check, Gavel, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatUsd } from "@/lib/money";
import { costMoves } from "@/lib/rules/options";
import { duration, ease, spring } from "../motion";
import { Avatar } from "../ui/avatar";
import { cn } from "../ui/cn";
import { Typewriter } from "../ui/typewriter";
import { useCalmMotion } from "../use-reduced-motion";

/**
 * The landing page's product preview: one case, read, decided and approved. It loops while it's
 * on screen, pauses on hover, and waits for clicks when the visitor prefers less motion.
 */

const PHASES = [
  { id: "read", label: "Read", ms: 4400 },
  { id: "decide", label: "Decide", ms: 4800 },
  { id: "approve", label: "Approve", ms: 6000 },
] as const;

const COSTS = costMoves({
  amount: 8600,
  reason: "not_received",
  stage: "inquiry",
  protectedSale: true,
  highVolume: false,
  evidence: "strong",
});

const MOVE = { fight: "Fight", settle: "Settle", refund: "Refund" } as const;

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
        "border-line bg-paper relative overflow-hidden rounded-[22px] border p-6 shadow-[0_1px_2px_rgb(30_38_20/0.05),0_40px_80px_-36px_rgb(30_38_20/0.32)] sm:p-7",
        className,
      )}
    >
      {/* The case */}
      <div className="flex items-center gap-3.5">
        <Avatar name="Sam Rivera" size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-ink truncate text-[17px] font-semibold">Sam Rivera</p>
          <p className="text-ink-2 truncate text-[15px]">Cedar &amp; Smoke candle trio</p>
        </div>
        <p className="text-ink text-[22px] font-semibold tracking-[-0.02em] tabular-nums">$86</p>
      </div>

      {/* Where it is */}
      <div className="mt-6 flex items-center gap-2">
        <div role="tablist" aria-label="Preview steps" className="grid flex-1 grid-cols-3 gap-1.5">
          {PHASES.map((p, i) => {
            const active = i === phase;
            const done = i < phase;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPhase(i)}
                className="group text-left"
              >
                <span className="bg-ink/[0.07] relative block h-1 overflow-hidden rounded-full">
                  {(done || (active && !playing)) && (
                    <span className="bg-moss absolute inset-0 rounded-full" />
                  )}
                  {active && playing && (
                    <motion.span
                      key={`${cycle}-${phase}`}
                      className="bg-moss absolute inset-0 origin-left rounded-full"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: p.ms / 1000, ease: "linear" }}
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "mt-2 block text-[14px] font-medium transition-colors",
                    active ? "text-ink" : "text-ink-3 group-hover:text-ink-2",
                  )}
                >
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>
        {!reduced && (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Play the preview" : "Pause the preview"}
            className="text-ink-3 hover:bg-wash hover:text-ink -mr-1.5 flex size-8 shrink-0 items-center justify-center self-start rounded-lg transition-colors [&_svg]:size-3.5"
          >
            {paused ? <Play /> : <Pause />}
          </button>
        )}
      </div>

      {/* What happens at that step */}
      <div className="relative mt-5 h-[262px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${current.id}-${cycle}`}
            role="tabpanel"
            aria-label={current.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.out } }}
            exit={{ opacity: 0, y: -6, transition: { duration: duration.base, ease: ease.in } }}
            className="h-full"
          >
            {current.id === "read" && <ReadStep />}
            {current.id === "decide" && <DecideStep />}
            {current.id === "approve" && <ApproveStep still={Boolean(reduced)} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

const appear = (delay: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.out, delay } },
});

function ReadStep() {
  return (
    <div className="flex h-full flex-col gap-4">
      <motion.p
        {...appear(0.05)}
        className="bg-cream text-ink max-w-[88%] rounded-[16px] rounded-tl-[5px] px-4 py-3 text-[15px] leading-relaxed"
      >
        &ldquo;My candles never arrived. It&rsquo;s been over a week.&rdquo;
      </motion.p>
      <motion.div {...appear(0.4)}>
        <p className="text-ink text-[15px] font-semibold">Truce&rsquo;s read</p>
        <p className="text-ink-2 mt-1.5 min-h-[78px] text-[15px] leading-relaxed">
          <Typewriter
            delay={0.65}
            cps={75}
            text="USPS shows it delivered 4 days ago, to the address on the PayPal payment. It may be on a porch or with a neighbor."
          />
        </p>
      </motion.div>
    </div>
  );
}

function DecideStep() {
  const max = Math.max(...COSTS.map((c) => c.worst));
  return (
    <div className="flex h-full flex-col">
      <motion.div {...appear(0.05)} className="flex items-start gap-3">
        <span className="bg-ink text-cream inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] font-medium [&_svg]:size-3.5">
          <Gavel />
          Fight
        </span>
        <p className="text-ink text-[16px] leading-snug font-semibold">
          Tracking shows it was delivered to the PayPal address.
        </p>
      </motion.div>
      <motion.div {...appear(0.3)} className="mt-auto space-y-3.5">
        {COSTS.map((c, i) => {
          const pick = c.move === "fight";
          return (
            <div key={c.move} className="grid grid-cols-[64px_1fr_64px] items-center gap-4">
              <span className={cn("text-[15px]", pick ? "text-ink font-semibold" : "text-ink-2")}>
                {MOVE[c.move]}
              </span>
              <span className="bg-ink/[0.06] block h-2.5 overflow-hidden rounded-full">
                <motion.span
                  className={cn(
                    "block h-full origin-left rounded-full",
                    pick ? "bg-moss" : "bg-ink/25",
                  )}
                  style={{ width: `${Math.max(4, (c.expected / max) * 100)}%` }}
                  initial={{ scaleX: 0 }}
                  animate={{
                    scaleX: 1,
                    transition: {
                      duration: duration.slower + 0.3,
                      ease: ease.out,
                      delay: 0.5 + i * 0.12,
                    },
                  }}
                />
              </span>
              <span
                className={cn(
                  "text-right text-[15px] tabular-nums",
                  pick ? "text-ink font-semibold" : "text-ink-2",
                )}
              >
                {formatUsd(c.expected)}
              </span>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}

function ApproveStep({ still }: { still: boolean }) {
  // Typing, then the press, then sent, then the buyer's answer a beat later.
  const [step, setStep] = useState(still ? 3 : 0);

  useEffect(() => {
    if (still) return;
    const timers = [
      window.setTimeout(() => setStep(1), 2600),
      window.setTimeout(() => setStep(2), 3000),
      window.setTimeout(() => setStep(3), 4300),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [still]);

  const sent = step >= 2;
  return (
    <div className="flex h-full flex-col">
      <motion.div {...appear(0.05)} className="bg-cream rounded-[16px] px-4 py-3.5">
        <p className="text-ink min-h-[72px] text-[15px] leading-relaxed">
          <Typewriter
            cps={95}
            delay={0.3}
            text="Hi Sam, USPS shows your order was delivered 4 days ago to the address on your PayPal payment. Could you check with your neighbors?"
          />
        </p>
        <p className="text-moss-deep mt-3 flex items-center gap-2 text-[14px] font-medium">
          <Check className="size-4" strokeWidth={2.5} />
          Every sentence checked
        </p>
      </motion.div>

      <div className="mt-auto flex items-center gap-3">
        <motion.span
          layout
          transition={spring.layout}
          animate={{ scale: step === 1 ? 0.96 : 1 }}
          className={cn(
            "rounded-btn relative inline-flex h-11 items-center justify-center gap-2 overflow-hidden px-5 text-[15px] font-medium",
            sent ? "bg-lemon text-on-lemon" : "bg-ink text-cream",
          )}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {sent ? (
              <motion.span
                key="sent"
                className="flex items-center gap-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Check className="size-4" strokeWidth={2.75} />
                Sent
              </motion.span>
            ) : (
              <motion.span key="approve" exit={{ opacity: 0, y: -8 }}>
                Approve and send
              </motion.span>
            )}
          </AnimatePresence>
        </motion.span>
        <AnimatePresence>
          {step === 3 && (
            <motion.span {...appear(0)} className="text-ink text-[15px] font-medium">
              Sam closed the case. <span className="text-moss-deep">Kept $86.</span>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
