"use client";

import { motion } from "motion/react";
import { duration, ease } from "../motion";
import { cn } from "../ui/cn";

/** The problem in numbers: the dispute fee, the 1.5% line and the 10-day window, each drawn. */

const inView = { once: true, amount: 0.5 } as const;

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={inView}
      transition={{ duration: duration.slow, ease: ease.out, delay }}
    >
      {children}
    </motion.div>
  );
}

function StatCard({
  figure,
  title,
  body,
  children,
  delay,
}: {
  figure: string;
  title: string;
  body: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <Reveal
      delay={delay}
      className="border-line bg-paper flex flex-col rounded-[16px] border p-6 sm:p-7"
    >
      <p className="text-ink text-[44px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
        {figure}
      </p>
      <h3 className="text-ink mt-4 text-base font-semibold">{title}</h3>
      <p className="text-ink-2 mt-1.5 text-[15px] leading-relaxed">{body}</p>
      <div className="mt-6 pt-1 sm:mt-auto">{children}</div>
    </Reveal>
  );
}

function FeeBars() {
  const rows = [
    { label: "Standard fee", value: "$15", width: 50, tone: "bg-ink/80" },
    { label: "High-volume fee", value: "$30", width: 100, tone: "bg-risk-500" },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.label}>
          <div className="text-ink-2 mb-1.5 flex justify-between text-xs">
            <span>{r.label}</span>
            <span className="text-ink font-medium tabular-nums">{r.value}</span>
          </div>
          <div className="bg-ink/[0.06] h-2.5 rounded-full">
            <motion.div
              className={cn("h-full origin-left rounded-full", r.tone)}
              style={{ width: `${r.width}%` }}
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={inView}
              transition={{
                duration: duration.slower + 0.3,
                ease: ease.out,
                delay: 0.3 + i * 0.15,
              }}
            />
          </div>
        </div>
      ))}
      <p className="text-ink-3 text-xs">
        Past the 1.5% line it&rsquo;s $30, charged even when you win.
      </p>
    </div>
  );
}

function RatioLine() {
  // A 0–3% scale: the line sits in the middle.
  return (
    <div>
      <div className="bg-ink/[0.06] relative h-2.5 rounded-full">
        <div className="bg-risk-50 absolute inset-y-0 right-0 left-1/2 rounded-r-full" />
        <motion.div
          className="bg-moss absolute inset-y-0 left-0 origin-left rounded-full"
          style={{ width: "23%" }}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={inView}
          transition={{ duration: duration.slower + 0.3, ease: ease.out, delay: 0.35 }}
        />
        <div className="bg-ink absolute -top-1.5 -bottom-1.5 left-1/2 w-0.5 -translate-x-1/2 rounded-full" />
      </div>
      <div className="text-ink-3 mt-2 flex justify-between text-xs tabular-nums">
        <span>0%</span>
        <span className="text-ink font-medium">1.5% line</span>
        <span>3%</span>
      </div>
      <p className="text-ink-3 mt-2 text-xs">Truce shows how much headroom you have left.</p>
    </div>
  );
}

function DayStrip() {
  return (
    <div>
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => (
          <motion.div
            key={i}
            className={cn(
              "h-7 rounded-[5px]",
              i < 6
                ? "bg-ink/[0.07]"
                : i < 8
                  ? "bg-warn-50 ring-warn-200 ring-1 ring-inset"
                  : "bg-risk-50 ring-risk-200 ring-1 ring-inset",
            )}
            initial={{ opacity: 0, y: 6 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={inView}
            transition={{ duration: duration.base, ease: ease.out, delay: 0.25 + i * 0.05 }}
          />
        ))}
      </div>
      <div className="text-ink-3 mt-2 flex justify-between text-xs">
        <span>Day 1</span>
        <span className="text-risk-700 font-medium">PayPal decides</span>
      </div>
      <p className="text-ink-3 mt-2 text-xs">Truce sorts every case by its deadline.</p>
    </div>
  );
}

export function Numbers() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <StatCard
        delay={0}
        figure="$15 or $30"
        title="The fee for a lost claim"
        body="When a claim goes the buyer's way, PayPal keeps a dispute fee on top of the refund."
      >
        <FeeBars />
      </StatCard>
      <StatCard
        delay={0.08}
        figure="1.5%"
        title="The claims ratio line"
        body="Cross it with more than 100 sales in three months and every claim costs $30, won or lost."
      >
        <RatioLine />
      </StatCard>
      <StatCard
        delay={0.16}
        figure="10 days"
        title="To answer a claim"
        body="Miss PayPal's response window and the buyer usually wins by default, whatever the evidence says."
      >
        <DayStrip />
      </StatCard>
    </div>
  );
}
