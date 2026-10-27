"use client";

import { mutate } from "swr";
import type {
  AddTrackingRequest,
  AddTrackingResponse,
  ApproveRequest,
  ApproveResponse,
  CaseResponse,
  CasesResponse,
  OrdersResponse,
  SessionResponse,
} from "@/lib/api-types";
import type { Case, CaseStatus, Draft, Move } from "@/lib/domain";
import { postJson } from "./api";
import { caseKey, refreshAll } from "./hooks";

/** The status a case moves to once the seller approves a move, before the server confirms it. */
export function expectedStatus(kase: Pick<Case, "stage">, move: Move): CaseStatus {
  if (move === "refund") return "closed";
  if (move === "settle") return "waiting_buyer";
  return kase.stage === "inquiry" ? "waiting_buyer" : "with_paypal";
}

function patchCase(
  list: CasesResponse | undefined,
  next: Partial<Case> & { id: string },
): CasesResponse | undefined {
  if (!list) return list;
  return { cases: list.cases.map((c) => (c.id === next.id ? { ...c, ...next } : c)) };
}

/**
 * Approves a move: the case moves to its new status on screen at once, then the server's answer
 * replaces the guess. If the server refuses, the guess is rolled back and the error is thrown.
 */
export async function approveCase(kase: Case, move: Move, draft: Draft): Promise<ApproveResponse> {
  const optimistic = {
    id: kase.id,
    status: expectedStatus(kase, move),
    updatedAt: new Date().toISOString(),
  };
  const body: ApproveRequest = { move, draft };
  const key = caseKey(kase.id);

  let response: ApproveResponse | null = null;
  try {
    await Promise.all([
      mutate<CasesResponse>("/api/cases", (list) => patchCase(list, optimistic), {
        revalidate: false,
      }),
      mutate<CaseResponse>(
        key,
        (data) => (data ? { ...data, case: { ...data.case, ...optimistic } } : data),
        {
          revalidate: false,
        },
      ),
    ]);
    response = await postJson<ApproveResponse>(
      `/api/cases/${encodeURIComponent(kase.id)}/approve`,
      body,
    );
    const done = response;
    await Promise.all([
      mutate<CaseResponse>(
        key,
        (data) => (data ? { ...data, case: done.case, events: done.events } : data),
        {
          revalidate: false,
        },
      ),
      mutate<CasesResponse>("/api/cases", (list) => patchCase(list, done.case), {
        revalidate: false,
      }),
    ]);
    return done;
  } catch (error) {
    await Promise.all([
      mutate<CasesResponse>(
        "/api/cases",
        (list) => patchCase(list, { id: kase.id, status: kase.status, updatedAt: kase.updatedAt }),
        {
          revalidate: false,
        },
      ),
      mutate<CaseResponse>(
        key,
        (data) => (data ? { ...data, case: { ...data.case, status: kase.status } } : data),
        {
          revalidate: false,
        },
      ),
    ]);
    throw error;
  } finally {
    void mutate(key);
    void mutate("/api/cases");
    void mutate("/api/metrics");
  }
}

/** Adds tracking to an order, then refreshes the orders list with the server's copy. */
export async function addTracking(
  orderId: string,
  request: AddTrackingRequest,
): Promise<AddTrackingResponse> {
  const response = await postJson<AddTrackingResponse>(
    `/api/orders/${encodeURIComponent(orderId)}/tracking`,
    request,
  );
  await mutate<OrdersResponse>(
    "/api/orders",
    (data) =>
      data ? { orders: data.orders.map((o) => (o.id === orderId ? response.order : o)) } : data,
    { revalidate: true },
  );
  return response;
}

/** Puts the demo copy back to the start. */
export async function resetDemo(): Promise<SessionResponse> {
  const response = await postJson<SessionResponse>("/api/session/reset");
  await mutate("/api/session", response, { revalidate: false });
  await refreshAll();
  return response;
}
