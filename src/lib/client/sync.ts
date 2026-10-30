"use client";

import { mutate } from "swr";
import type { ShopResponse, SyncEvent, SyncStepId } from "@/lib/api-types";
import { readEvents } from "@/lib/sse";
import { errorMessage, openStream, shopApi } from "./api";
import { keys, refreshShop } from "./hooks";
import { createStore, useStore } from "./store";

/**
 * "Sync now": Truce reads the shop's disputes and orders from PayPal again, streamed as
 * SyncEvents. One sync per shop, kept outside the settings screen so it finishes even if the
 * seller looks elsewhere meanwhile.
 */

export interface SyncStep {
  id: SyncStepId;
  label: string;
  state: "start" | "done" | "error" | "skipped";
  detail?: string;
}

export interface SyncState {
  status: "idle" | "running" | "done" | "error";
  /** Each step as it last reported, in the order they started. */
  steps: SyncStep[];
  progress: { step: SyncStepId; done: number; total: number } | null;
  /** Disputes found so far. */
  found: number;
  result: { cases: number; orders: number } | null;
  error: string | null;
  startedAt: number | null;
  endedAt: number | null;
}

const IDLE: SyncState = {
  status: "idle",
  steps: [],
  progress: null,
  found: 0,
  result: null,
  error: null,
  startedAt: null,
  endedAt: null,
};

const syncs = createStore<Record<string, SyncState>>({});

function setSync(shopId: string, update: (state: SyncState) => SyncState) {
  syncs.set((all) => ({ ...all, [shopId]: update(all[shopId] ?? IDLE) }));
}

function reduce(state: SyncState, event: SyncEvent): SyncState {
  switch (event.type) {
    case "step": {
      const step: SyncStep = {
        id: event.step,
        label: event.label,
        state: event.state,
        detail: event.detail,
      };
      const known = state.steps.some((s) => s.id === event.step);
      return {
        ...state,
        steps: known
          ? state.steps.map((s) => (s.id === event.step ? step : s))
          : [...state.steps, step],
      };
    }
    case "progress":
      return { ...state, progress: { step: event.step, done: event.done, total: event.total } };
    case "case":
      return { ...state, found: state.found + 1 };
    case "analysis":
      return state;
    case "done":
      return {
        ...state,
        status: "done",
        result: { cases: event.cases, orders: event.orders },
        endedAt: Date.now(),
      };
    case "error":
      return { ...state, status: "error", error: event.message, endedAt: Date.now() };
  }
}

/** The step to describe in one line: the one running, or else the last one that reported. */
export function currentStep(state: SyncState): SyncStep | null {
  return [...state.steps].reverse().find((s) => s.state === "start") ?? state.steps.at(-1) ?? null;
}

export function startSync(shopId: string) {
  if (syncs.get()[shopId]?.status === "running") return;
  setSync(shopId, () => ({ ...IDLE, status: "running", startedAt: Date.now() }));
  void (async () => {
    try {
      const response = await openStream(shopApi(shopId, "sync"), {});
      for await (const event of readEvents<SyncEvent>(response)) {
        setSync(shopId, (state) => reduce(state, event));
        if (event.type === "done") {
          await mutate<ShopResponse>(
            keys.shop(shopId),
            (current) => (current ? { ...current, shop: event.shop } : current),
            { revalidate: true },
          );
        }
      }
      setSync(shopId, (state) =>
        state.status === "running"
          ? {
              ...state,
              status: "error",
              error: "The sync stopped before it finished. Try again.",
              endedAt: Date.now(),
            }
          : state,
      );
    } catch (error) {
      setSync(shopId, (state) => ({
        ...state,
        status: "error",
        error: errorMessage(error),
        endedAt: Date.now(),
      }));
    } finally {
      void refreshShop(shopId);
    }
  })();
}

export function dismissSync(shopId: string) {
  if (syncs.get()[shopId]?.status === "running") return;
  setSync(shopId, () => IDLE);
}

export function useSync(shopId: string): SyncState {
  return useStore(syncs, (all) => all[shopId] ?? IDLE);
}
