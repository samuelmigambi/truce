"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** "⌘" on a Mac, "Ctrl" elsewhere, for shortcut hints. */
export function useModKey(): string {
  return useSyncExternalStore(
    noop,
    () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}
