"use client";

import type { SweepEvent } from "@/lib/api-types";
import { readEvents } from "@/lib/sse";
import { errorMessage, openStream, shopApi } from "./api";
import { refreshShop } from "./hooks";
import { createStore, useStore } from "./store";

/**
 * The overnight check, run now: progress and a live log from the SweepEvent stream, one per
 * shop, so a check keeps running while the seller moves around that shop.
 */

export type SweepLine =
  | { id: string; kind: "case"; caseId: string; summary: string }
  | { id: string; kind: "order"; orderId: string; ok: boolean; label: string }
  | { id: string; kind: "progress"; label: string };

export interface SweepState {
  status: "idle" | "running" | "done" | "error";
  progress: { label: string; done: number; total: number } | null;
  lines: SweepLine[];
  result: { analyzed: number; flagged: number } | null;
  cost: number;
  error: string | null;
  startedAt: number | null;
  endedAt: number | null;
}

const IDLE: SweepState = {
  status: "idle",
  progress: null,
  lines: [],
  result: null,
  cost: 0,
  error: null,
  startedAt: null,
  endedAt: null,
};

const sweeps = createStore<Record<string, SweepState>>({});
let counter = 0;

function setSweep(shopId: string, update: (state: SweepState) => SweepState) {
  sweeps.set((all) => ({ ...all, [shopId]: update(all[shopId] ?? IDLE) }));
}

function reduce(state: SweepState, event: SweepEvent): SweepState {
  const id = `s${counter++}`;
  switch (event.type) {
    case "progress": {
      const lines =
        state.progress?.label === event.label
          ? state.lines
          : [...state.lines, { id, kind: "progress" as const, label: event.label }];
      return {
        ...state,
        progress: { label: event.label, done: event.done, total: event.total },
        lines,
      };
    }
    case "case":
      return {
        ...state,
        lines: [...state.lines, { id, kind: "case", caseId: event.caseId, summary: event.summary }],
      };
    case "order":
      return {
        ...state,
        lines: [
          ...state.lines,
          { id, kind: "order", orderId: event.orderId, ok: event.ok, label: event.label },
        ],
      };
    case "usage":
      return { ...state, cost: state.cost + (event.cost ?? 0) };
    case "done":
      return {
        ...state,
        status: "done",
        endedAt: Date.now(),
        result: { analyzed: event.analyzed, flagged: event.flagged },
        progress: state.progress ? { ...state.progress, done: state.progress.total } : null,
      };
    case "error":
      return { ...state, status: "error", error: event.message, endedAt: Date.now() };
  }
}

export function startSweep(shopId: string) {
  if (sweeps.get()[shopId]?.status === "running") return;
  setSweep(shopId, () => ({ ...IDLE, status: "running", startedAt: Date.now() }));
  void (async () => {
    try {
      const response = await openStream(shopApi(shopId, "sweep"), {});
      for await (const event of readEvents<SweepEvent>(response)) {
        setSweep(shopId, (state) => reduce(state, event));
      }
      setSweep(shopId, (state) =>
        state.status === "running"
          ? {
              ...state,
              status: "done",
              endedAt: Date.now(),
              result: state.result ?? { analyzed: 0, flagged: 0 },
            }
          : state,
      );
    } catch (error) {
      setSweep(shopId, (state) => ({
        ...state,
        status: "error",
        error: errorMessage(error),
        endedAt: Date.now(),
      }));
    } finally {
      // The shop records when the check last ran; the cases and orders may have changed too.
      void refreshShop(shopId);
    }
  })();
}

export function dismissSweep(shopId: string) {
  if (sweeps.get()[shopId]?.status === "running") return;
  setSweep(shopId, () => IDLE);
}

export function useSweep(shopId: string): SweepState {
  return useStore(sweeps, (all) => all[shopId] ?? IDLE);
}
