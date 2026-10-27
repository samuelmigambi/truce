"use client";

import { createStore, useStore } from "./store";

/** The Ask Truce slide-over: open from anywhere in the app, optionally with a question ready. */

interface AskState {
  open: boolean;
  /** Text to put in the box when it opens. */
  draft: string;
  /** Bumped on each open, so the box picks up a new draft. */
  nonce: number;
}

const ask = createStore<AskState>({ open: false, draft: "", nonce: 0 });

export function openAsk(draft = "") {
  ask.set((s) => ({ open: true, draft, nonce: s.nonce + 1 }));
}

export function closeAsk() {
  ask.set((s) => ({ ...s, open: false }));
}

export function toggleAsk() {
  const s = ask.get();
  if (s.open) closeAsk();
  else openAsk();
}

export function useAsk(): AskState {
  return useStore(ask);
}
