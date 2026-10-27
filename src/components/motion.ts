import type { Transition, Variants } from "motion/react";

/**
 * Truce's motion tokens. Every animation in the app takes its timing from here, so the whole
 * product moves with one rhythm: quick, soft landings, nothing that bounces for show.
 */

export const ease = {
  /** The house curve: fast start, long gentle landing. */
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
  in: [0.55, 0, 1, 0.45],
} as const;

/** Seconds. */
export const duration = {
  instant: 0.12,
  fast: 0.16,
  base: 0.22,
  slow: 0.32,
  slower: 0.48,
  /** Number tickers and gauges. */
  count: 0.9,
} as const;

export const spring = {
  /** Indicators that slide between options (nav, segmented controls). */
  snappy: { type: "spring", stiffness: 520, damping: 40, mass: 0.8 },
  /** Panels and sheets. */
  panel: { type: "spring", stiffness: 380, damping: 40, mass: 0.9 },
  /** Small things that pop in: chips, checks. */
  pop: { type: "spring", stiffness: 560, damping: 26, mass: 0.7 },
  /** Layout changes in lists. */
  layout: { type: "spring", stiffness: 420, damping: 42, mass: 0.9 },
} as const satisfies Record<string, Transition>;

/** Delay between items in a list, in seconds. */
export const STAGGER = 0.03;

export const transition = {
  base: { duration: duration.base, ease: ease.out },
  fast: { duration: duration.fast, ease: ease.out },
  slow: { duration: duration.slow, ease: ease.out },
} as const satisfies Record<string, Transition>;

/** Pages and sections: fade and rise 8 px. */
export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: transition.base },
};

/** A list whose children stagger in. */
export const staggerList = (delayChildren = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: STAGGER, delayChildren } },
});

export const listItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: transition.base },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.85 },
  show: { opacity: 1, scale: 1, transition: spring.pop },
};
