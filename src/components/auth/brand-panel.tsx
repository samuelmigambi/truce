"use client";

import { motion } from "motion/react";
import { Check } from "lucide-react";
import Link from "next/link";
import { cn } from "../ui/cn";
import { duration, ease } from "../motion";
import { Logo } from "../ui/logo";

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: duration.slow, ease: ease.out, delay },
});

/**
 * The sign-in pages' left side on wide screens: the logo, one plain line, and a deck of cases as
 * Truce shows them, so a person signing up sees what they're signing up for.
 */
export function BrandPanel() {
  return (
    <aside
      aria-label="About Truce"
      className="bg-forest text-chalk dark:bg-frame sticky top-0 hidden h-dvh flex-col overflow-hidden p-12 lg:flex xl:p-14"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 -right-40 size-[560px] rounded-full bg-[radial-gradient(circle,rgb(221_235_148/0.17),transparent_65%)] dark:opacity-60"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-56 -left-40 size-[480px] rounded-full bg-[radial-gradient(circle,rgb(92_117_36/0.35),transparent_68%)] dark:hidden"
      />

      <Link href="/" aria-label="Truce home" className="relative self-start rounded-md">
        <Logo tone="dark" className="h-8" />
      </Link>

      <div className="relative my-auto py-10">
        <motion.p
          {...rise(0.05)}
          className="max-w-[460px] text-[30px] leading-[1.15] font-semibold tracking-[-0.025em] text-balance xl:text-[34px]"
        >
          Fair answers to PayPal disputes. You approve every step.
        </motion.p>
        <CaseDeck />
      </div>
    </aside>
  );
}

type Case = {
  buyer: string;
  amount: string;
  item: string;
  reason: string;
  stage: string;
  due: string;
  decision: string;
  confidence: string;
  reply: string;
  evidence: string[];
  action: string;
};

/** Made-up cases, front to back. */
const CASES: readonly Case[] = [
  {
    buyer: "Sam Rivera",
    amount: "$86",
    item: "Cedar & Smoke candle trio",
    reason: "Not received",
    stage: "Inquiry",
    due: "Due in 8 days",
    decision: "Fight",
    confidence: "High confidence",
    reply: "Tracking shows it was delivered to the address on the PayPal payment.",
    evidence: ["E1", "E2"],
    action: "Approve and send",
  },
  {
    buyer: "Priya Nair",
    amount: "$42",
    item: "Linen apron, sage",
    reason: "Not as described",
    stage: "Claim",
    due: "Due in 5 days",
    decision: "Settle for $10",
    confidence: "Medium confidence",
    reply: "The buyer's photo shows a small mark the listing didn't mention. Offer $10 back.",
    evidence: ["E1", "E3"],
    action: "Approve offer",
  },
  {
    buyer: "Jordan Lee",
    amount: "$120",
    item: "Walnut serving board",
    reason: "Unauthorized",
    stage: "Chargeback",
    due: "Due in 12 days",
    decision: "Fight",
    confidence: "High confidence",
    reply: "The same PayPal account placed two earlier orders to this address, both kept.",
    evidence: ["E2", "E4"],
    action: "Approve and send",
  },
];

const DEPTH = CASES.length;

/** A still deck of cases: the front one readable, the next two peeking out behind it. */
function CaseDeck() {
  return (
    // Decoration only, so screen readers skip it.
    <div aria-hidden className="relative mt-14 max-w-[380px]">
      {/* Light behind the deck, so the glass has something to frost. */}
      <div className="pointer-events-none absolute -inset-x-10 -top-16 -bottom-10 rounded-full bg-[radial-gradient(closest-side,rgb(221_235_148/0.2),rgb(92_117_36/0.16)_55%,transparent)] blur-2xl dark:opacity-40" />

      <div className="relative grid">
        {CASES.map((item, depth) => (
          <div
            key={item.buyer}
            className="origin-bottom [grid-area:1/1]"
            // Cards scale from their bottom edge, so each one behind is lifted enough to peek out.
            style={{
              transform: `translateY(${depth * -24}px) scale(${1 - depth * 0.05})`,
              zIndex: DEPTH - depth,
            }}
          >
            <GlassCase item={item} />
          </div>
        ))}
      </div>
    </div>
  );
}

const glassPill =
  "inline-flex h-5 items-center rounded-full border border-white/[0.14] bg-white/[0.06] px-2 text-[10.5px] font-medium text-chalk/80";

/** One case on dark frosted glass. */
function GlassCase({ item }: { item: Case }) {
  const initials = item.buyer
    .split(" ")
    .map((part) => part[0])
    .join("");
  return (
    <div className="relative overflow-hidden rounded-[16px] border border-white/[0.1] bg-[linear-gradient(155deg,rgb(44_56_30/0.9),rgb(20_26_13/0.94))] p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_32px_64px_-32px_rgb(0_0_0/0.85)] backdrop-blur-xl backdrop-saturate-150 dark:bg-[linear-gradient(155deg,rgb(42_42_45/0.92),rgb(26_26_28/0.95))]">
      {/* The light catching the top edge of the glass. */}
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

      <div className="flex items-start gap-2.5">
        <span className="bg-lemon/[0.14] text-lemon ring-lemon/25 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-1">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-chalk truncate text-[14px] font-semibold">{item.buyer}</p>
            <p className="text-chalk text-[14px] font-semibold tabular-nums">{item.amount}</p>
          </div>
          <p className="text-chalk/60 truncate text-[12px]">{item.item}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className={glassPill}>{item.reason}</span>
            <span className={glassPill}>{item.stage}</span>
            <span className={cn(glassPill, "text-chalk/50 border-transparent bg-transparent px-1")}>
              {item.due}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-[11px] border border-white/[0.08] bg-white/[0.05] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="bg-lemon text-forest inline-flex h-5 items-center rounded-full px-2 text-[10.5px] font-semibold">
            {item.decision}
          </span>
          <span className="text-chalk/55 text-[10.5px] font-medium">{item.confidence}</span>
        </div>
        <p className="text-chalk/90 mt-1.5 min-h-[2lh] text-[12px] leading-snug font-medium">
          {item.reply}{" "}
          <span className="inline-flex translate-y-[-1px] gap-1 align-middle">
            {item.evidence.map((id) => (
              <span
                key={id}
                className="bg-lemon/[0.16] text-lemon inline-flex h-4 items-center rounded-[4px] px-1 text-[9.5px] font-semibold tabular-nums"
              >
                {id}
              </span>
            ))}
          </span>
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-lemon/90 flex items-center gap-1.5 text-[10.5px] font-medium">
          <Check className="size-3" strokeWidth={2.5} />
          Every sentence checked
        </p>
        <span className="rounded-btn bg-chalk text-forest inline-flex h-7 items-center px-2.5 text-[12px] font-medium">
          {item.action}
        </span>
      </div>
    </div>
  );
}
