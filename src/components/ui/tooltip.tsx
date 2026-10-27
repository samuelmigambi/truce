"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { duration, ease } from "../motion";
import { cn } from "./cn";
import { Portal } from "./overlay";

interface Anchor {
  x: number;
  top: number;
  bottom: number;
}

/**
 * A short hint on hover or keyboard focus. It renders in a portal, so containers that clip their
 * overflow never cut it off.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  delay = 280,
  className,
  style,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const trigger = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const id = useId();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function show() {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = trigger.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const half = 130;
      const x = Math.min(Math.max(r.left + r.width / 2, half), window.innerWidth - half);
      setAnchor({ x, top: r.top, bottom: r.bottom });
    }, delay);
  }

  function hide() {
    window.clearTimeout(timer.current);
    setAnchor(null);
  }

  const flip = anchor !== null && side === "top" && anchor.top < 56;
  const below = side === "bottom" || flip;

  return (
    <>
      <span
        ref={trigger}
        className={cn("inline-flex", className)}
        style={style}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-describedby={anchor ? id : undefined}
      >
        {children}
      </span>
      <Portal>
        <AnimatePresence>
          {anchor && (
            <motion.div
              id={id}
              role="tooltip"
              className={cn(
                "bg-ink text-cream shadow-pop pointer-events-none fixed z-[70] max-w-[260px] -translate-x-1/2 rounded-lg px-2.5 py-1.5 text-xs leading-[1.45] font-medium",
                below ? "" : "-translate-y-full",
              )}
              style={{ left: anchor.x, top: below ? anchor.bottom + 8 : anchor.top - 8 }}
              initial={{ opacity: 0, y: below ? -3 : 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: duration.instant } }}
              transition={{ duration: duration.fast, ease: ease.out }}
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}
