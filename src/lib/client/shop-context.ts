"use client";

import { createContext, useContext, useMemo } from "react";
import useSWR from "swr";
import type { MeResponse, ShopResponse, ShopSummary } from "@/lib/api-types";
import type { Shop, ShopRole, User } from "@/lib/domain";
import { formatMoney, type Cents } from "@/lib/money";
import { fetcher, shopApi } from "./api";
import { dayLabel, formatDate, formatDateTime, formatTime, timeAgo } from "./format";
import { useNow } from "./now";

/**
 * The shop on screen. Its server layout checks that the person is a member, then hands over
 * what it read, so the first paint needs no request; SWR keeps it fresh from there.
 */
export interface ShopSeed {
  shop: Shop;
  role: ShopRole;
  shops: ShopSummary[];
  user: User;
}

export const ShopSeedContext = createContext<ShopSeed | null>(null);

export const ME_KEY = "/api/me";

function useSeed(): ShopSeed {
  const seed = useContext(ShopSeedContext);
  if (!seed) throw new Error("This part of the app only works inside a shop.");
  return seed;
}

/** The ID of the shop on screen; every API call and link in the app is scoped to it. */
export function useShopId(): string {
  return useSeed().shop.id;
}

/** The shop and the person's role in it, read again on focus and after every change. */
export function useShopResponse() {
  const seed = useSeed();
  const fallbackData = useMemo<ShopResponse>(
    () => ({ shop: seed.shop, role: seed.role }),
    [seed.shop, seed.role],
  );
  // The server just read this shop, so the first render doesn't ask again.
  return useSWR<ShopResponse>(shopApi(seed.shop.id), fetcher, {
    fallbackData,
    revalidateIfStale: false,
  });
}

export function useShop(): Shop {
  const seed = useSeed();
  return useShopResponse().data?.shop ?? seed.shop;
}

export function useRole(): ShopRole {
  const seed = useSeed();
  return useShopResponse().data?.role ?? seed.role;
}

/** The signed-in person and every shop they're in. */
export function useMe() {
  const seed = useSeed();
  const fallbackData = useMemo<MeResponse>(
    () => ({ user: seed.user, shops: seed.shops }),
    [seed.user, seed.shops],
  );
  const swr = useSWR<MeResponse>(ME_KEY, fetcher, { fallbackData, revalidateIfStale: false });
  return {
    user: swr.data?.user ?? seed.user,
    shops: swr.data?.shops ?? seed.shops,
    mutate: swr.mutate,
  };
}

/** Dates in the shop's time zone, on the app's shared clock. */
export function useShopDates() {
  const { timeZone } = useShop();
  const now = useNow();
  return useMemo(
    () => ({
      now,
      timeZone,
      /** "Oct 25". */
      date: (iso: string) => formatDate(iso, now, timeZone),
      /** "Oct 25, 3:40 PM". */
      dateTime: (iso: string) => formatDateTime(iso, now, timeZone),
      /** "3:40 PM". */
      time: (iso: string) => formatTime(iso, timeZone),
      /** "3 hours ago". */
      ago: (iso: string) => timeAgo(iso, now, timeZone),
      /** "Today", "Mon". */
      day: (iso: string) => dayLabel(iso, now, timeZone),
    }),
    [now, timeZone],
  );
}

/** Formats cents in the shop's currency: "$86", "£42.50". */
export function useMoney(): (cents: Cents) => string {
  const { currency } = useShop();
  return useMemo(() => (cents: Cents) => formatMoney(cents, currency), [currency]);
}
