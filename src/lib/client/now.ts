"use client";

import { useSyncExternalStore } from "react";

/**
 * One shared clock for relative times ("Due in 3 days", "2 hours ago"). It ticks every 30 seconds
 * so labels stay true without each component running its own timer.
 */

let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const serverNow = now;

/** The current time in milliseconds, refreshed every 30 seconds. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => serverNow,
  );
}
