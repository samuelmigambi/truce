"use client";

import { useSyncExternalStore } from "react";
import { productById, type Product } from "@/lib/catalog";
import type { Cents } from "@/lib/money";

/**
 * The Wick & Ember cart, kept in localStorage so it survives a reload. Prices shown here are for
 * display; the server prices every order again from the catalog.
 */

export interface CartLine {
  productId: string;
  quantity: number;
}

const KEY = "wick-ember-cart";
const MAX_QUANTITY = 9;
const EMPTY: CartLine[] = [];
const listeners = new Set<() => void>();
let cache: CartLine[] | null = null;

function read(): CartLine[] {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    cache = Array.isArray(parsed)
      ? parsed
          .filter(
            (l): l is CartLine =>
              typeof l === "object" &&
              l !== null &&
              typeof l.productId === "string" &&
              typeof l.quantity === "number",
          )
          .filter((l) => productById(l.productId))
          .map((l) => ({
            productId: l.productId,
            quantity: Math.min(MAX_QUANTITY, Math.max(1, Math.round(l.quantity))),
          }))
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(lines: CartLine[]) {
  cache = lines;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // Private browsing can refuse storage; the cart still works for this visit.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function addToCart(productId: string, quantity = 1) {
  const lines = read();
  const existing = lines.find((l) => l.productId === productId);
  write(
    existing
      ? lines.map((l) =>
          l.productId === productId
            ? { ...l, quantity: Math.min(MAX_QUANTITY, l.quantity + quantity) }
            : l,
        )
      : [...lines, { productId, quantity: Math.min(MAX_QUANTITY, quantity) }],
  );
}

export function setQuantity(productId: string, quantity: number) {
  if (quantity <= 0) return removeFromCart(productId);
  write(
    read().map((l) =>
      l.productId === productId ? { ...l, quantity: Math.min(MAX_QUANTITY, quantity) } : l,
    ),
  );
}

export function removeFromCart(productId: string) {
  write(read().filter((l) => l.productId !== productId));
}

export function clearCart() {
  write([]);
}

export interface PricedLine extends CartLine {
  product: Product;
  total: Cents;
}

export function priceCart(lines: CartLine[]): {
  lines: PricedLine[];
  count: number;
  subtotal: Cents;
} {
  const priced = lines.flatMap((l) => {
    const product = productById(l.productId);
    return product ? [{ ...l, product, total: product.price * l.quantity }] : [];
  });
  return {
    lines: priced,
    count: priced.reduce((n, l) => n + l.quantity, 0),
    subtotal: priced.reduce((sum, l) => sum + l.total, 0),
  };
}

export const MAX_PER_ITEM = MAX_QUANTITY;

// The cart drawer: opened from the header, and after adding something.
let drawerOpen = false;
const drawerListeners = new Set<() => void>();

function setDrawer(open: boolean) {
  drawerOpen = open;
  drawerListeners.forEach((l) => l());
}

export const openCart = () => setDrawer(true);
export const closeCart = () => setDrawer(false);

function subscribeDrawer(listener: () => void) {
  drawerListeners.add(listener);
  return () => {
    drawerListeners.delete(listener);
  };
}

export function useCartOpen(): boolean {
  return useSyncExternalStore(
    subscribeDrawer,
    () => drawerOpen,
    () => false,
  );
}
