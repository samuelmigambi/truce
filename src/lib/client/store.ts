"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny external store. Streams (analysis, chat, the overnight check) live in these rather than
 * in components, so they keep running when the seller moves to another page and back.
 */
export interface Store<T> {
  get(): T;
  set(update: T | ((current: T) => T)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(update) {
      const next = typeof update === "function" ? (update as (current: T) => T)(state) : update;
      if (Object.is(next, state)) return;
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: Store<T>): T;
export function useStore<T, S>(store: Store<T>, select: (state: T) => S): S;
export function useStore<T, S>(store: Store<T>, select?: (state: T) => S): T | S {
  const read = () => (select ? select(store.get()) : store.get());
  return useSyncExternalStore(store.subscribe, read, read);
}
