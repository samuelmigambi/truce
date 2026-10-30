"use client";

import { ArrowRight, Check, ChevronsUpDown, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type MouseEvent } from "react";
import type { ShopSummary } from "@/lib/api-types";
import { shopHref } from "@/lib/client/api";
import { shopState, type ShopState } from "@/lib/client/labels";
import { useMe, useShop } from "@/lib/client/shop-context";
import { cn } from "../../ui/cn";
import {
  MenuDivider,
  MenuLabel,
  MenuLink,
  Popover,
  triggerProps,
  usePopover,
} from "../../ui/popover";
import { Spinner } from "../../ui/spinner";
import { ShopMark } from "./shop-mark";

/** Ready shops first, by name; shops still in setup after them. */
function ordered(shops: ShopSummary[]): ShopSummary[] {
  return [...shops].sort(
    (a, b) =>
      Number(a.status !== "ready") - Number(b.status !== "ready") || a.name.localeCompare(b.name),
  );
}

/** A plain click switches in place; a click that asks for a new tab or window gets one. */
function plainClick(event: MouseEvent) {
  return !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0);
}

/**
 * The shop on screen, and the way to every other one: a person can run several shops, each with
 * its own PayPal. Shops still being set up go back to onboarding where they left off.
 */
/** The shop's type under its name: colored text, no chip. */
const STATE_TEXT: Record<ShopState["tone"], string> = {
  mist: "text-moss-deep",
  moss: "text-moss-deep",
  outline: "text-ink-2",
  warn: "text-warn-700",
};

export function ShopSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const shop = useShop();
  const { shops } = useMe();
  const control = usePopover();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [going, setGoing] = useState<string | null>(null);
  const state = shopState(shop);

  function switchTo(event: MouseEvent<HTMLAnchorElement>, target: ShopSummary) {
    control.hide();
    if (target.id === shop.id) {
      event.preventDefault();
      return;
    }
    if (!plainClick(event)) return;
    event.preventDefault();
    // The mobile sheet stays open with the spinner until the other shop is ready.
    setGoing(target.name);
    startTransition(() => router.push(shopHref(target.id)));
  }

  return (
    <>
      <button
        {...triggerProps(control, "menu")}
        className={cn(
          "rounded-btn border-line bg-ink/[0.035] dark:bg-paper hover:border-line-strong flex w-full items-center gap-2.5 border px-2 py-2 text-left transition-[border-color,box-shadow]",
          control.open && "border-line-strong shadow-lift",
        )}
      >
        <ShopMark name={pending && going ? going : shop.name} />
        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-[13.5px] leading-5 font-medium">
            {pending && going ? going : shop.name}
          </span>
          {pending ? (
            <span className="text-ink-2 block text-xs leading-[18px]">Switching shops</span>
          ) : (
            <span
              title={state.hint}
              className={cn("block truncate text-xs leading-[18px]", STATE_TEXT[state.tone])}
            >
              {state.label}
            </span>
          )}
        </span>
        {pending ? (
          <Spinner className="text-ink-3 size-3.5 shrink-0" label="Switching shops" />
        ) : (
          <ChevronsUpDown className="text-ink-3 size-3.5 shrink-0" aria-hidden />
        )}
      </button>

      <Popover control={control} kind="menu" label="Your shops" width={272}>
        <div className="min-h-0 overflow-y-auto p-1.5">
          <MenuLabel>Your shops</MenuLabel>
          {ordered(shops).map((s) => {
            const current = s.id === shop.id;
            if (s.status !== "ready") {
              return (
                <MenuLink
                  key={s.id}
                  href={`/onboarding?shop=${encodeURIComponent(s.id)}`}
                  onSelect={() => {
                    control.hide();
                    onNavigate?.();
                  }}
                >
                  <ShopMark name={s.name || "New shop"} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{s.name || "New shop"}</span>
                    <span className="text-warn-700 block text-xs">Finish setup</span>
                  </span>
                  <ArrowRight className="text-ink-3 size-3.5" aria-hidden />
                </MenuLink>
              );
            }
            return (
              <MenuLink
                key={s.id}
                href={shopHref(s.id)}
                aria-current={current ? "true" : undefined}
                onClick={(event) => switchTo(event, s)}
              >
                <ShopMark name={s.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{s.name}</span>
                  <span className="text-ink-2 block text-xs">{shopState(s).label}</span>
                </span>
                {current && <Check className="text-moss size-4" strokeWidth={2.5} aria-hidden />}
              </MenuLink>
            );
          })}
          <MenuDivider />
          <MenuLink
            href="/onboarding?new=1"
            onSelect={() => {
              control.hide();
              onNavigate?.();
            }}
          >
            <Plus />
            Add a shop
          </MenuLink>
        </div>
      </Popover>
    </>
  );
}
