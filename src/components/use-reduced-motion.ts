"use client";

import { useReducedMotion } from "motion/react";
import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * Whether to hold still, without upsetting hydration: the server can't know the visitor's
 * setting, so the first render matches the server and the real value follows right after.
 */
export function useCalmMotion(): boolean {
  const reduced = useReducedMotion();
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return hydrated && Boolean(reduced);
}
