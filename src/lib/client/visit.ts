"use client";

import { useSyncExternalStore } from "react";
import { preload } from "swr";
import type { Workspace } from "@/lib/domain";
import { fetcher } from "./api";

/**
 * Remembers that this browser already has a demo copy, so a returning visitor sees quiet
 * skeletons while it loads and a first-time visitor sees a proper welcome while it's made.
 * The cookie itself is httpOnly, so the browser keeps its own note: when the copy expires.
 */

const KEY = "truce-demo-copy";
const noop = () => () => {};

function hasLiveCopy(): boolean {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return false;
    const { expiresAt } = JSON.parse(raw) as { expiresAt?: string | null };
    return !expiresAt || new Date(expiresAt).getTime() > Date.now();
  } catch {
    return false;
  }
}

/** True when this browser has no demo copy yet, so the first request will make one. */
export function useFirstVisit(): boolean {
  return useSyncExternalStore(
    noop,
    () => !hasLiveCopy(),
    () => false,
  );
}

export function rememberCopy(workspace: Workspace) {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ id: workspace.id, expiresAt: workspace.expiresAt }),
    );
  } catch {
    // Storage can be off in private windows; the welcome just shows again next time.
  }
}

let warming: Promise<unknown> | null = null;

/**
 * Starts making the demo copy, then fetches the inbox, before the visitor even clicks: called
 * on hover or focus of "Try the live demo". The app picks up these requests instead of
 * sending its own.
 */
export function warmUpDemo() {
  if (warming) return;
  warming = Promise.resolve(preload("/api/session", fetcher))
    .then(() => {
      void preload("/api/cases", fetcher);
      void preload("/api/metrics", fetcher);
    })
    .catch(() => {
      warming = null;
    });
}
