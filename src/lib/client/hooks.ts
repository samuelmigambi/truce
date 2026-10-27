"use client";

import useSWR, { mutate } from "swr";
import type {
  CaseResponse,
  CasesResponse,
  Metrics,
  OrdersResponse,
  SessionResponse,
  StatusResponse,
} from "@/lib/api-types";
import { fetcher } from "./api";

/**
 * The app's data, through SWR. Every hook waits for the session first: the first request makes
 * the visitor's demo copy and sets its cookie, and parallel first requests would each make one.
 */

const REACTION_WINDOW = 4 * 60_000;

export function useSession() {
  return useSWR<SessionResponse>("/api/session", fetcher, { revalidateOnFocus: false });
}

function useReady(): boolean {
  return Boolean(useSession().data);
}

/** Recently approved cases get their scripted reactions on the next read, so we read again soon. */
function recentlyActive(updatedAt: string, closed: boolean): boolean {
  return !closed && Date.now() - new Date(updatedAt).getTime() < REACTION_WINDOW;
}

export function useCases() {
  const ready = useReady();
  return useSWR<CasesResponse>(ready ? "/api/cases" : null, fetcher, {
    refreshInterval: (data) =>
      data?.cases.some(
        (c) => c.status !== "needs_you" && recentlyActive(c.updatedAt, c.status === "closed"),
      )
        ? 5000
        : 0,
  });
}

export function useCase(id: string) {
  const ready = useReady();
  return useSWR<CaseResponse>(ready ? `/api/cases/${encodeURIComponent(id)}` : null, fetcher, {
    // Never show one case's file under another case's address while it loads.
    keepPreviousData: false,
    refreshInterval: (data) =>
      data &&
      data.case.status !== "needs_you" &&
      recentlyActive(data.case.updatedAt, data.case.status === "closed")
        ? 3000
        : 0,
  });
}

export function useOrders() {
  const ready = useReady();
  return useSWR<OrdersResponse>(ready ? "/api/orders" : null, fetcher);
}

export function useMetrics() {
  const ready = useReady();
  return useSWR<Metrics>(ready ? "/api/metrics" : null, fetcher);
}

export function useStatus() {
  const ready = useReady();
  return useSWR<StatusResponse>(ready ? "/api/status" : null, fetcher, {
    revalidateOnFocus: false,
  });
}

/** Re-reads everything the app shows, after a reset or a sweep. */
export function refreshAll() {
  // One argument only: SWR then revalidates without clearing what's on screen.
  return mutate(
    (key) => typeof key === "string" && key.startsWith("/api/") && key !== "/api/session",
  );
}

export function caseKey(id: string) {
  return `/api/cases/${encodeURIComponent(id)}`;
}
