"use client";

import useSWR, { mutate } from "swr";
import type {
  CaseResponse,
  CasesResponse,
  ChatsResponse,
  Metrics,
  NotificationsResponse,
  OrdersResponse,
  StatusResponse,
} from "@/lib/api-types";
import { fetcher, shopApi } from "./api";
import { chatsKey } from "./chat";
import { ME_KEY, useShopId } from "./shop-context";

/**
 * The app's data, through SWR. Every key sits under the shop's own API path, so two shops can
 * never share a cache entry, even when their sample cases have the same IDs.
 */

export const keys = {
  shop: (shopId: string) => shopApi(shopId),
  cases: (shopId: string) => shopApi(shopId, "cases"),
  case: (shopId: string, caseId: string) => shopApi(shopId, `cases/${encodeURIComponent(caseId)}`),
  orders: (shopId: string) => shopApi(shopId, "orders"),
  metrics: (shopId: string) => shopApi(shopId, "metrics"),
  notifications: (shopId: string) => shopApi(shopId, "notifications"),
  chats: chatsKey,
  me: ME_KEY,
  status: "/api/status",
} as const;

const REACTION_WINDOW = 4 * 60_000;

/**
 * What each polled read last looked like. When a buyer or PayPal answers, the case changes, and
 * whatever depends on it (the bell, the numbers, the counts) is read again at once rather than
 * waiting for its own turn.
 */
const lastSeen = new Map<string, string>();

function noticeChange(shopId: string, key: string, signature: string, also: string[] = []) {
  const before = lastSeen.get(key);
  lastSeen.set(key, signature);
  if (before === undefined || before === signature) return;
  for (const k of [keys.notifications(shopId), keys.metrics(shopId), ...also]) void mutate(k);
}

/** A case approved a moment ago may hear back soon (a buyer, PayPal), so it's read again soon. */
function recentlyActive(updatedAt: string, closed: boolean): boolean {
  return !closed && Date.now() - new Date(updatedAt).getTime() < REACTION_WINDOW;
}

export function useCases() {
  const shopId = useShopId();
  return useSWR<CasesResponse>(keys.cases(shopId), fetcher, {
    onSuccess: (data) =>
      noticeChange(
        shopId,
        keys.cases(shopId),
        data.cases.map((c) => `${c.id}:${c.status}:${c.updatedAt}`).join(),
      ),
    refreshInterval: (data) =>
      data?.cases.some(
        (c) => c.status !== "needs_you" && recentlyActive(c.updatedAt, c.status === "closed"),
      )
        ? 5000
        : 0,
  });
}

export function useCase(caseId: string) {
  const shopId = useShopId();
  return useSWR<CaseResponse>(keys.case(shopId, caseId), fetcher, {
    // Never show one case's file under another case's address while it loads.
    keepPreviousData: false,
    onSuccess: (data) =>
      noticeChange(
        shopId,
        keys.case(shopId, caseId),
        `${data.case.status}:${data.case.updatedAt}:${data.events.length}`,
        [keys.cases(shopId)],
      ),
    refreshInterval: (data) =>
      data &&
      data.case.status !== "needs_you" &&
      recentlyActive(data.case.updatedAt, data.case.status === "closed")
        ? 3000
        : 0,
  });
}

export function useOrders() {
  const shopId = useShopId();
  return useSWR<OrdersResponse>(keys.orders(shopId), fetcher);
}

export function useMetrics() {
  const shopId = useShopId();
  return useSWR<Metrics>(keys.metrics(shopId), fetcher);
}

/** This person's saved Ask Truce chats in the shop, newest first. */
export function useChats() {
  const shopId = useShopId();
  return useSWR<ChatsResponse>(keys.chats(shopId), fetcher);
}

/** The shop's notifications, polled about once a minute while the app is open. */
export function useNotifications() {
  const shopId = useShopId();
  return useSWR<NotificationsResponse>(keys.notifications(shopId), fetcher, {
    refreshInterval: 60_000,
  });
}

/** Which services this server has (models, page reads, storage). Not shop-specific. */
export function useStatus() {
  return useSWR<StatusResponse>(keys.status, fetcher, { revalidateOnFocus: false });
}

/** Re-reads everything the app shows for one shop, after a reset, a sweep or a sync. */
export function refreshShop(shopId: string) {
  const base = shopApi(shopId);
  // One argument only: SWR then revalidates without clearing what's on screen.
  return Promise.all([
    mutate((key) => typeof key === "string" && (key === base || key.startsWith(`${base}/`))),
    mutate(ME_KEY),
  ]);
}

/** Drops a shop's cached data entirely, once the shop is gone. */
export function forgetShopData(shopId: string) {
  const base = shopApi(shopId);
  return mutate(
    (key) => typeof key === "string" && (key === base || key.startsWith(`${base}/`)),
    undefined,
    { revalidate: false },
  );
}
