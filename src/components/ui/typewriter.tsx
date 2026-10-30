"use client";

import { animate } from "motion/react";
import { useEffect, useRef } from "react";
import { useCalmMotion } from "../use-reduced-motion";

/** Text that writes itself in, at about `cps` characters a second. Instant for reduced motion. */
export function Typewriter({
  text,
  cps = 70,
  delay = 0,
  className,
}: {
  text: string;
  cps?: number;
  delay?: number;
  className?: string;
}) {
  const reduced = useCalmMotion();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.textContent = text;
      return;
    }
    el.textContent = "";
    const controls = animate(0, text.length, {
      duration: text.length / cps,
      delay,
      ease: "linear",
      onUpdate(v) {
        el.textContent = text.slice(0, Math.round(v));
      },
    });
    return () => controls.stop();
  }, [text, cps, delay, reduced]);

  return (
    <span className={className}>
      <span aria-hidden ref={ref} />
      <span className="sr-only">{text}</span>
    </span>
  );
}
