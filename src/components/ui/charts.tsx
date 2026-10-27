"use client";

import { motion } from "motion/react";
import { useId, useState, type ReactNode } from "react";
import { duration, ease } from "../motion";
import { cn } from "./cn";
import { useCalmMotion } from "../use-reduced-motion";

/**
 * Hand-built SVG charts in the Truce palette. Each one is small, labelled in plain words, and
 * animates once into place (never for people who prefer less motion).
 */

// ---------- Gauge ----------

const CX = 100;
const CY = 100;
const R = 80;

function point(fraction: number, radius = R) {
  const angle = Math.PI * (1 - fraction);
  return { x: CX + radius * Math.cos(angle), y: CY - radius * Math.sin(angle) };
}

/**
 * A half-circle gauge with a marked line, such as the claims ratio against PayPal's 1.5% line.
 * `value` and `marker` share the scale 0 to `max`.
 */
export function Gauge({
  value,
  max,
  marker,
  tone = "good",
  children,
  className,
  label,
}: {
  value: number;
  max: number;
  marker?: { value: number; label: string };
  tone?: "good" | "warn" | "risk";
  children?: ReactNode;
  className?: string;
  label: string;
}) {
  const fraction = Math.min(1, Math.max(0, value / max));
  const stroke =
    tone === "risk"
      ? "var(--color-risk-500)"
      : tone === "warn"
        ? "var(--color-warn-500)"
        : "var(--color-moss)";
  const markerFraction = marker ? Math.min(1, marker.value / max) : null;
  const inner = markerFraction !== null ? point(markerFraction, R - 13) : null;
  const outer = markerFraction !== null ? point(markerFraction, R + 13) : null;
  const tag = markerFraction !== null ? point(markerFraction, R + 24) : null;
  const arc = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox="0 -14 200 128"
        role="img"
        aria-label={label}
        className="w-full overflow-visible"
      >
        <path
          d={arc}
          fill="none"
          stroke="rgb(30 38 20 / 0.07)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {markerFraction !== null && (
          <path
            d={`M ${point(markerFraction).x} ${point(markerFraction).y} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
            fill="none"
            stroke="var(--color-risk-50)"
            strokeWidth="14"
          />
        )}
        <motion.path
          d={arc}
          fill="none"
          stroke={stroke}
          strokeWidth="14"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: Math.max(fraction, 0.004) }}
          transition={{ duration: duration.count + 0.2, ease: ease.out, delay: 0.1 }}
        />
        {inner && outer && tag && marker && (
          <g>
            <line
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--color-ink)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <text
              x={tag.x}
              y={tag.y}
              textAnchor={
                markerFraction !== null && markerFraction > 0.55
                  ? "start"
                  : markerFraction !== null && markerFraction < 0.45
                    ? "end"
                    : "middle"
              }
              dominantBaseline="middle"
              className="fill-ink text-[9px] font-medium"
            >
              {marker.label}
            </text>
          </g>
        )}
      </svg>
      {children && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">{children}</div>
      )}
    </div>
  );
}

// ---------- Progress ring ----------

/** A small ring that fills as work completes. */
export function ProgressRing({
  value,
  size = 20,
  stroke = 2.5,
  className,
  label,
}: {
  /** 0 to 1. */
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("-rotate-90", className)}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.15}
        strokeWidth={stroke}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        initial={false}
        animate={{ pathLength: Math.min(1, Math.max(0, value)) }}
        transition={{ duration: duration.slow, ease: ease.out }}
      />
    </svg>
  );
}

// ---------- Sparkline ----------

/** A tiny trend line for a KPI tile. */
export function Sparkline({
  values,
  className,
  stroke = "var(--color-moss)",
  fill = "rgb(221 235 148 / 0.45)",
}: {
  values: number[];
  className?: string;
  stroke?: string;
  fill?: string;
}) {
  const id = useId();
  if (values.length < 2) return null;
  const w = 100;
  const h = 28;
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 2 - (v / max) * (h - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn("h-7 w-full", className)}
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={fill} />
          <stop offset="1" stopColor={fill} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <motion.path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: duration.count, ease: ease.out }}
      />
    </svg>
  );
}

// ---------- Meter ----------

/** A horizontal bar on a shared scale, for costs and spend. */
export function Meter({
  value,
  max,
  tone = "ink",
  className,
  delay = 0,
  height = "h-2",
}: {
  value: number;
  max: number;
  tone?: "ink" | "moss" | "lemon" | "warn" | "risk" | "muted";
  className?: string;
  delay?: number;
  height?: string;
}) {
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const fills = {
    ink: "bg-ink",
    moss: "bg-moss",
    lemon: "bg-lemon-deep",
    warn: "bg-warn-500",
    risk: "bg-risk-500",
    muted: "bg-ink/25",
  };
  return (
    <div
      aria-hidden
      className={cn(
        "bg-ink/[0.06] relative w-full overflow-hidden rounded-full",
        height,
        className,
      )}
    >
      <motion.div
        className={cn("absolute inset-y-0 left-0 origin-left rounded-full", fills[tone])}
        style={{ width: `${Math.max(fraction * 100, value > 0 ? 1.5 : 0)}%` }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: duration.slower + 0.2, ease: ease.out, delay }}
      />
    </div>
  );
}

// ---------- Stacked bars ----------

export interface Series {
  key: string;
  label: string;
  color: string;
}

export interface StackedDatum {
  label: string;
  /** A longer label for the tooltip. */
  title: string;
  values: Record<string, number>;
}

/**
 * Columns stacked by series, with a tooltip per column. Used for 13 weeks of disputes by reason.
 * Plain HTML boxes, so corners stay round at any width.
 */
export function StackedBars({
  data,
  series,
  className,
  label,
  height = 180,
}: {
  data: StackedDatum[];
  series: Series[];
  className?: string;
  label: string;
  height?: number;
}) {
  const reduced = useCalmMotion();
  const [hover, setHover] = useState<number | null>(null);
  const totals = data.map((d) => series.reduce((sum, s) => sum + (d.values[s.key] ?? 0), 0));
  const peak = Math.max(...totals, 0);
  const max = Math.max(2, Math.ceil(peak / 2) * 2);
  const ticks = [max, max / 2, 0];
  const plot = height - 22;
  const active = hover !== null ? data[hover] : null;
  const activeTotal = hover !== null ? (totals[hover] ?? 0) : 0;
  const band = 100 / Math.max(data.length, 1);

  return (
    <div className={cn("relative", className)} role="group" aria-label={label}>
      <div className="flex">
        <div className="relative w-7 shrink-0" style={{ height: plot }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="text-ink-3 absolute right-2 -translate-y-1/2 text-[11px] tabular-nums"
              style={{ top: plot - (t / max) * plot }}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" onPointerLeave={() => setHover(null)}>
          <div className="relative" style={{ height: plot }}>
            {ticks.map((t) => (
              <span
                key={t}
                aria-hidden
                className={cn(
                  "absolute inset-x-0 h-px",
                  t === 0 ? "bg-ink/20" : "border-ink/10 border-t border-dashed",
                )}
                style={{ top: plot - (t / max) * plot }}
              />
            ))}
            <div className="absolute inset-0 flex items-end">
              {data.map((d, i) => (
                <button
                  key={d.label}
                  type="button"
                  aria-label={`${d.title}: ${totals[i] ?? 0} ${totals[i] === 1 ? "dispute" : "disputes"}`}
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="group flex h-full flex-1 items-end justify-center rounded-md focus-visible:outline-offset-0"
                >
                  <motion.span
                    className={cn(
                      "flex w-[46%] max-w-7 flex-col-reverse gap-[2px] transition-opacity duration-150",
                      hover !== null && hover !== i && "opacity-45",
                    )}
                    style={{
                      height: `${((totals[i] ?? 0) / max) * 100}%`,
                      transformOrigin: "bottom",
                    }}
                    initial={reduced ? false : { scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{
                      duration: duration.slower,
                      ease: ease.out,
                      delay: 0.15 + i * 0.03,
                    }}
                  >
                    {series.map((s, si) => {
                      const v = d.values[s.key] ?? 0;
                      if (!v) return null;
                      const isTop = series
                        .slice(si + 1)
                        .every((later) => !(d.values[later.key] ?? 0));
                      return (
                        <span
                          key={s.key}
                          className={cn(
                            "block w-full",
                            isTop ? "rounded-t-[5px]" : "",
                            si === 0 || series.slice(0, si).every((e) => !(d.values[e.key] ?? 0))
                              ? "rounded-b-[2px]"
                              : "",
                          )}
                          style={{ flexGrow: v, flexBasis: 0, background: s.color }}
                        />
                      );
                    })}
                  </motion.span>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex h-4">
            {data.map((d, i) => (
              <span
                key={d.label}
                className={cn("relative min-w-0 flex-1", i % 2 === 1 && "max-xl:invisible")}
              >
                <span className="text-ink-3 absolute left-1/2 -translate-x-1/2 text-[11px] whitespace-nowrap tabular-nums">
                  {d.label}
                </span>
              </span>
            ))}
          </div>
          {active && hover !== null && (
            <div
              className="border-line bg-paper shadow-pop pointer-events-none absolute z-10 w-44 -translate-x-1/2 rounded-lg border p-2.5"
              style={{ left: `${Math.min(Math.max((hover + 0.5) * band, 18), 82)}%`, top: 0 }}
            >
              <p className="text-ink text-xs font-medium">{active.title}</p>
              <ul className="mt-1.5 space-y-1">
                {series.map((s) => (
                  <li
                    key={s.key}
                    className="text-ink-2 flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-[3px]" style={{ background: s.color }} />
                      {s.label}
                    </span>
                    <span className="text-ink tabular-nums">{active.values[s.key] ?? 0}</span>
                  </li>
                ))}
              </ul>
              <p className="border-line-soft text-ink mt-1.5 flex justify-between border-t pt-1.5 text-xs font-medium">
                <span>Total</span>
                <span className="tabular-nums">{activeTotal}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A legend row for a chart's series. */
export function Legend({ series, className }: { series: Series[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5", className)}>
      {series.map((s) => (
        <li key={s.key} className="text-ink-2 flex items-center gap-1.5 text-xs">
          <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}
