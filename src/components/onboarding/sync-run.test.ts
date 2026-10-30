import { describe, expect, it } from "vitest";
import type { SyncEvent } from "@/lib/api-types";
import { reduceSync, SYNC_STEPS, type SyncRun } from "./sync-run";

function fresh(): SyncRun {
  return {
    status: "running",
    steps: SYNC_STEPS.map((step) => ({ id: step.id, state: "pending", label: step.label })),
    cases: [],
    analysis: null,
    result: null,
    error: null,
    startedAt: 0,
    endedAt: null,
  };
}

function play(events: SyncEvent[]): SyncRun {
  return events.reduce((run, event, i) => reduceSync(run, event, i + 1), fresh());
}

const step = (run: SyncRun, id: string) => run.steps.find((s) => s.id === id)!;

describe("reduceSync", () => {
  it("lights steps up in turn, with the server's labels and a skipped step's reason", () => {
    const run = play([
      { type: "step", step: "paypal", state: "start", label: "Check the keys" },
      { type: "step", step: "paypal", state: "done", label: "Checked the keys" },
      {
        type: "step",
        step: "history",
        state: "skipped",
        label: "Order history",
        detail: "Transaction search is off",
      },
      { type: "step", step: "disputes", state: "start", label: "Find disputes" },
    ]);
    expect(step(run, "paypal")).toMatchObject({ state: "done", label: "Checked the keys" });
    expect(step(run, "history")).toMatchObject({
      state: "skipped",
      detail: "Transaction search is off",
    });
    expect(step(run, "disputes").state).toBe("active");
    expect(step(run, "sort").state).toBe("pending");
  });

  it("counts progress, and a step that reports progress counts as started", () => {
    const run = play([{ type: "progress", step: "orders", done: 3, total: 8 }]);
    expect(step(run, "orders")).toMatchObject({ state: "active", progress: { done: 3, total: 8 } });
  });

  it("adds disputes as they arrive, once each", () => {
    const found = {
      type: "case" as const,
      caseId: "c1",
      buyer: "Sam Rivera",
      amount: 8600,
      reason: "not_received" as const,
      status: "needs_you" as const,
      itemSummary: "Cedar & Smoke trio",
    };
    const run = play([found, { ...found, status: "waiting_buyer" }, { ...found, caseId: "c2" }]);
    expect(run.cases.map((c) => c.caseId)).toEqual(["c1", "c2"]);
    expect(run.cases[0]?.status).toBe("waiting_buyer");
  });

  it("follows the first analysis inside the sync, draft text included", () => {
    const run = play([
      {
        type: "analysis",
        caseId: "c1",
        event: {
          type: "step",
          step: "triage",
          state: "start",
          label: "Read the case",
          model: "nvidia/Nemotron-3.5-Lightning",
        },
      },
      {
        type: "analysis",
        caseId: "c1",
        event: { type: "step", step: "triage", state: "done", label: "Read the case" },
      },
      {
        type: "analysis",
        caseId: "c1",
        event: { type: "step", step: "draft", state: "start", label: "Draft the reply" },
      },
      { type: "analysis", caseId: "c1", event: { type: "text", step: "draft", delta: "Hi Sam, " } },
      { type: "analysis", caseId: "c1", event: { type: "text", step: "draft", delta: "thanks." } },
      { type: "analysis", caseId: "c1", event: { type: "text", step: "verify", delta: "ignored" } },
    ]);
    const triage = run.analysis?.steps.find((s) => s.id === "triage");
    expect(triage).toMatchObject({ state: "done", model: "nvidia/Nemotron-3.5-Lightning" });
    expect(run.analysis?.draft).toBe("Hi Sam, thanks.");
    expect(run.analysis?.steps.find((s) => s.id === "draft")?.state).toBe("active");
  });

  it("finishes: active steps done, ones never started skipped", () => {
    const run = play([
      { type: "step", step: "paypal", state: "done", label: "Checked" },
      { type: "step", step: "disputes", state: "start", label: "Finding" },
      {
        type: "done",
        shop: {} as never,
        cases: 2,
        orders: 14,
        analyzedCaseId: "c1",
      },
    ]);
    expect(run.status).toBe("done");
    expect(run.endedAt).toBe(3);
    expect(step(run, "disputes").state).toBe("done");
    expect(step(run, "analysis").state).toBe("skipped");
    expect(run.result?.orders).toBe(14);
  });

  it("stops on an error, marking the step that was running", () => {
    const run = play([
      { type: "step", step: "paypal", state: "start", label: "Checking" },
      { type: "error", message: "PayPal didn't answer." },
    ]);
    expect(run.status).toBe("error");
    expect(run.error).toBe("PayPal didn't answer.");
    expect(step(run, "paypal").state).toBe("error");
  });
});
