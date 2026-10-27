"use client";

import { motion } from "motion/react";
import { Package, ShieldCheck, Sparkles } from "lucide-react";
import { duration, ease } from "../motion";
import { ThinkingMark } from "../ui/logo";
import { useCalmMotion } from "../use-reduced-motion";

const WHAT = [
  { icon: <Package />, text: "240 orders from the last 90 days" },
  { icon: <ShieldCheck />, text: "Five open disputes, each with its own story" },
  { icon: <Sparkles />, text: "Nemotron on Token Factory, running for real" },
];

/**
 * A first visitor's welcome while their private demo copy is made and seeded. Returning
 * visitors get plain skeletons instead.
 */
export function SettingUp() {
  const calm = useCalmMotion();
  return (
    <div className="flex min-h-[calc(100dvh-56px)] items-center justify-center px-6 py-16 lg:min-h-dvh">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6, transition: { duration: duration.fast, ease: ease.in } }}
        transition={{ duration: duration.slow, ease: ease.out }}
        role="status"
        aria-live="polite"
        className="flex w-full max-w-[420px] flex-col items-center text-center"
      >
        <ThinkingMark className="size-14" />
        <h1 className="text-ink mt-6 text-[22px] leading-tight font-semibold tracking-[-0.02em] text-balance">
          Setting up your copy of Wick &amp; Ember
        </h1>
        <p className="text-ink-2 mt-2 text-[15px]">
          Five open disputes, 240 orders, ready in a moment.
        </p>

        <div className="bg-ink/[0.06] mt-7 h-1.5 w-full overflow-hidden rounded-full" aria-hidden>
          {calm ? (
            <div className="bg-moss h-full w-1/2 rounded-full" />
          ) : (
            <motion.div
              className="bg-moss shimmer shimmer-lemon h-full rounded-full"
              initial={{ width: "4%" }}
              animate={{ width: "92%" }}
              transition={{ duration: 14, ease: [0.08, 0.7, 0.2, 1] }}
            />
          )}
        </div>

        <ul className="mt-7 w-full space-y-2.5 text-left">
          {WHAT.map((item, i) => (
            <motion.li
              key={item.text}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: duration.base, ease: ease.out, delay: 0.25 + i * 0.12 }}
              className="border-line-soft bg-paper flex items-center gap-3 rounded-[10px] border px-3.5 py-2.5"
            >
              <span className="bg-mist text-moss-deep flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4">
                {item.icon}
              </span>
              <span className="text-ink text-[13.5px]">{item.text}</span>
            </motion.li>
          ))}
        </ul>

        <p className="text-ink-3 mt-6 text-xs leading-relaxed">
          Your copy is private to this browser. Its PayPal calls are simulated, so nothing goes to
          PayPal.
        </p>
      </motion.div>
    </div>
  );
}
