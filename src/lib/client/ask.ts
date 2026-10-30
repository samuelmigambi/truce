"use client";

import { startNewChat } from "./chat";
import { createStore, useStore } from "./store";

/**
 * The Ask Truce slide-over: open from anywhere in a shop, optionally with a question ready.
 * Each shop keeps its own, so switching shops never carries an open sheet or a draft along.
 */

export interface AskState {
  open: boolean;
  /** Text to put in the box when it opens. */
  draft: string;
  /** Bumped on each open, so the box picks up a new draft. */
  nonce: number;
}

const CLOSED: AskState = { open: false, draft: "", nonce: 0 };
const asks = createStore<Record<string, AskState>>({});

function setAsk(shopId: string, update: (state: AskState) => AskState) {
  asks.set((all) => ({ ...all, [shopId]: update(all[shopId] ?? CLOSED) }));
}

function showAsk(shopId: string, draft: string) {
  setAsk(shopId, (s) => ({ open: true, draft, nonce: s.nonce + 1 }));
}

/**
 * Opens the slide-over on a fresh chat for a new question, such as about the case or the order
 * on screen, with its words ready in the box when there are some.
 */
export function openAsk(shopId: string, draft = "") {
  startNewChat(shopId);
  showAsk(shopId, draft);
}

export function closeAsk(shopId: string) {
  setAsk(shopId, (s) => ({ ...s, open: false }));
}

/** Ctrl/⌘ K: the slide-over as it was left, on the last chat. */
export function toggleAsk(shopId: string) {
  if (asks.get()[shopId]?.open) closeAsk(shopId);
  else showAsk(shopId, "");
}

/**
 * On the home page Ask Truce is already on screen, so asking from the sidebar or with Ctrl/⌘ K
 * just puts the cursor in its box. False when there's no such box here.
 */
export function focusAskInput(): boolean {
  const input = document.querySelector<HTMLTextAreaElement>("#ask-hero, #ask-page");
  input?.focus();
  return input !== null;
}

export function useAsk(shopId: string): AskState {
  return useStore(asks, (all) => all[shopId] ?? CLOSED);
}
