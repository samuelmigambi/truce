"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

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

const loadedAt = now;

/**
 * The moment the server rendered the page, so the browser's first render shows the same
 * relative times the server wrote ("3 hours ago") and hydration never disagrees. The live clock
 * takes over right after.
 */
export const RenderedAtContext = createContext<number | null>(null);

/** The current time in milliseconds, refreshed every 30 seconds. */
export function useNow(): number {
  const renderedAt = useContext(RenderedAtContext);
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => renderedAt ?? loadedAt,
  );
}
