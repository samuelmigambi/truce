"use client";

import { mutate } from "swr";
import type {
  AddTrackingRequest,
  AddTrackingResponse,
  ApproveRequest,
  ApproveResponse,
  CaseResponse,
  CasesResponse,
  ConnectPayPalResponse,
  MeResponse,
  NotificationsResponse,
  OrdersResponse,
  ReadNotificationsRequest,
  ShopResponse,
  UpdateMeRequest,
  UpdateShopRequest,
} from "@/lib/api-types";
import type { Case, CaseStatus, Draft, Move } from "@/lib/domain";
import { forgetAnalyses } from "./analysis";
import { deleteJson, getJson, patchJson, postJson, shopApi } from "./api";
import { forgetChats } from "./chat";
import { forgetShopData, keys, refreshShop } from "./hooks";
import { dismissSweep } from "./sweep";
import { dismissSync } from "./sync";

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
export async function approveCase(
  shopId: string,
  kase: Case,
  move: Move,
  draft: Draft,
): Promise<ApproveResponse> {
  const optimistic = {
    id: kase.id,
    status: expectedStatus(kase, move),
    updatedAt: new Date().toISOString(),
  };
  const body: ApproveRequest = { move, draft };
  const caseKey = keys.case(shopId, kase.id);
  const listKey = keys.cases(shopId);

  try {
    await Promise.all([
      mutate<CasesResponse>(listKey, (list) => patchCase(list, optimistic), { revalidate: false }),
      mutate<CaseResponse>(
        caseKey,
        (data) => (data ? { ...data, case: { ...data.case, ...optimistic } } : data),
        { revalidate: false },
      ),
    ]);
    const done = await postJson<ApproveResponse>(
      shopApi(shopId, `cases/${encodeURIComponent(kase.id)}/approve`),
      body,
    );
    await Promise.all([
      mutate<CaseResponse>(
        caseKey,
        (data) => (data ? { ...data, case: done.case, events: done.events } : data),
        { revalidate: false },
      ),
      mutate<CasesResponse>(listKey, (list) => patchCase(list, done.case), { revalidate: false }),
    ]);
    return done;
  } catch (error) {
    await Promise.all([
      mutate<CasesResponse>(
        listKey,
        (list) => patchCase(list, { id: kase.id, status: kase.status, updatedAt: kase.updatedAt }),
        { revalidate: false },
      ),
      mutate<CaseResponse>(
        caseKey,
        (data) => (data ? { ...data, case: { ...data.case, status: kase.status } } : data),
        { revalidate: false },
      ),
    ]);
    throw error;
  } finally {
    void mutate(caseKey);
    void mutate(listKey);
    void mutate(keys.metrics(shopId));
    void mutate(keys.notifications(shopId));
  }
}

/** Adds tracking to an order, then refreshes the orders list with the server's copy. */
export async function addTracking(
  shopId: string,
  orderId: string,
  request: AddTrackingRequest,
): Promise<AddTrackingResponse> {
  const response = await postJson<AddTrackingResponse>(
    shopApi(shopId, `orders/${encodeURIComponent(orderId)}/tracking`),
    request,
  );
  await mutate<OrdersResponse>(
    keys.orders(shopId),
    (data) =>
      data
        ? { ...data, orders: data.orders.map((o) => (o.id === orderId ? response.order : o)) }
        : data,
    { revalidate: true },
  );
  return response;
}

/** Forgets what the browser holds for a shop: conversations, analysis runs, sweeps, syncs. */
function forgetShopState(shopId: string) {
  forgetChats(shopId);
  forgetAnalyses(shopId);
  dismissSweep(shopId);
  dismissSync(shopId);
}

/** Starts a sample shop over: every case, order and approval goes back to the start. */
export async function startSampleOver(shopId: string): Promise<ShopResponse> {
  const response = await postJson<ShopResponse>(shopApi(shopId, "sample/reset"));
  forgetShopState(shopId);
  await mutate(keys.shop(shopId), response, { revalidate: false });
  await refreshShop(shopId);
  return response;
}

/** Saves part of a shop (its profile, policies, or the person's own notifications). */
export async function updateShop(shopId: string, patch: UpdateShopRequest): Promise<ShopResponse> {
  const response = await patchJson<ShopResponse>(shopApi(shopId), patch);
  await mutate(keys.shop(shopId), response, { revalidate: false });
  // The switcher lists shops by name.
  if (patch.profile) void mutate(keys.me);
  return response;
}

/** Puts a shop's new PayPal connection on screen everywhere it shows. */
export async function showConnection(shopId: string, response: ConnectPayPalResponse) {
  await mutate<ShopResponse>(
    keys.shop(shopId),
    (current) => (current ? { ...current, shop: response.shop } : current),
    { revalidate: true },
  );
  void mutate(keys.me);
}

/** Checks the shop's PayPal keys again, and what the app can do with them. */
export async function checkPayPal(shopId: string): Promise<ConnectPayPalResponse> {
  const response = await postJson<ConnectPayPalResponse>(shopApi(shopId, "paypal/check"));
  await showConnection(shopId, response);
  return response;
}

/** Disconnects PayPal: Truce removes its webhook and forgets the keys. */
export async function disconnectPayPal(shopId: string): Promise<ShopResponse> {
  const response = await deleteJson<ShopResponse>(shopApi(shopId, "paypal"));
  if (response) await mutate(keys.shop(shopId), response, { revalidate: false });
  else await mutate(keys.shop(shopId));
  void mutate(keys.me);
  return response;
}

/** Deletes a shop and everything in it (owner only), and forgets it in this browser. */
export async function deleteShop(shopId: string): Promise<MeResponse | null> {
  await deleteJson(shopApi(shopId));
  forgetShopState(shopId);
  void forgetShopData(shopId);
  try {
    const me = await getJson<MeResponse>(keys.me);
    await mutate(keys.me, me, { revalidate: false });
    return me;
  } catch {
    return null;
  }
}

/**
 * Marks notifications read: these, or every one when `ids` is missing. The badge clears at
 * once; the server's count follows.
 */
export async function markNotificationsRead(
  shopId: string,
  uid: string,
  ids?: string[],
): Promise<void> {
  const key = keys.notifications(shopId);
  const wanted = ids ? new Set(ids) : null;
  await mutate<NotificationsResponse>(
    key,
    (data) => {
      if (!data) return data;
      let cleared = 0;
      const notifications = data.notifications.map((n) => {
        if ((wanted && !wanted.has(n.id)) || n.readBy.includes(uid)) return n;
        cleared++;
        return { ...n, readBy: [...n.readBy, uid] };
      });
      return { notifications, unread: wanted ? Math.max(0, data.unread - cleared) : 0 };
    },
    { revalidate: false },
  );
  const body: ReadNotificationsRequest = ids ? { ids } : {};
  try {
    await postJson(shopApi(shopId, "notifications/read"), body);
  } finally {
    void mutate(key);
  }
}

/** Saves the person's name. */
export async function updateMyName(name: string): Promise<void> {
  const body: UpdateMeRequest = { name };
  const response = await patchJson<MeResponse | undefined>(keys.me, body);
  if (response && "user" in response) await mutate(keys.me, response, { revalidate: false });
  else await mutate(keys.me);
}

/** Asks the server to check with Firebase whether the email is verified now. */
export async function refreshMe(): Promise<MeResponse> {
  const me = await getJson<MeResponse>(`${keys.me}?refresh=1`);
  await mutate(keys.me, me, { revalidate: false });
  return me;
}
