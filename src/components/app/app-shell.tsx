"use client";

import { motion } from "motion/react";
import {
  Activity,
  ArrowUpRight,
  Inbox,
  Menu,
  MessagesSquare,
  Package,
  Settings2,
  Store,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState, type CSSProperties, type ReactNode } from "react";
import { shopHref } from "@/lib/client/api";
import { useCases, useOrders } from "@/lib/client/hooks";
import { useShop } from "@/lib/client/shop-context";
import { spring } from "../motion";
import { CountBadge } from "../ui/chip";
import { cn } from "../ui/cn";
import { Logo } from "../ui/logo";
import { Sheet } from "../ui/overlay";
import { AskSheet } from "./ask/ask-sheet";
import { ShellBanners } from "./shell/banners";
import { Notifications } from "./shell/notifications";
import { ShopSwitcher } from "./shell/shop-switcher";
import { UserMenu } from "./shell/user-menu";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  count?: number;
  match: (path: string) => boolean;
}

function useNav(shopId: string, fullHistory: boolean): NavItem[] {
  const cases = useCases().data?.cases;
  const orders = useOrders().data;
  const home = shopHref(shopId);
  // Without the whole order history there's no honest "to ship" count.
  const toShip =
    fullHistory && orders?.history !== "disputes"
      ? orders?.orders.filter((o) => o.status === "paid").length
      : undefined;
  const under = (path: string) => (p: string) => p === path || p.startsWith(`${path}/`);
  return [
    {
      href: home,
      label: "Ask Truce",
      icon: <MessagesSquare />,
      match: (p) => p === home,
    },
    {
      href: shopHref(shopId, "cases"),
      label: "Cases",
      icon: <Inbox />,
      count: cases?.filter((c) => c.status === "needs_you").length,
      match: under(shopHref(shopId, "cases")),
    },
    {
      href: shopHref(shopId, "orders"),
      label: "Orders",
      icon: <Package />,
      count: toShip,
      match: under(shopHref(shopId, "orders")),
    },
    {
      href: shopHref(shopId, "health"),
      label: "Shop health",
      icon: <Activity />,
      match: under(shopHref(shopId, "health")),
    },
    {
      href: shopHref(shopId, "settings"),
      label: "Settings",
      icon: <Settings2 />,
      match: under(shopHref(shopId, "settings")),
    },
  ];
}

/**
 * The app around every screen in a shop: a sidebar on wide screens, a top bar and a sheet on
 * narrow ones. The sidebar holds the shop switcher, the screens, the account, and for a sample
 * shop the reminder that its PayPal is simulated. Ask Truce is one shortcut away everywhere.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const shop = useShop();
  const [navOpen, setNavOpen] = useState(false);
  const [bannerHeight, setBannerHeight] = useState(0);
  const closeNav = useCallback(() => setNavOpen(false), []);

  // Full-height screens (Ask Truce) size themselves around the strips at the top.
  const measureBanners = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setBannerHeight(Math.round(entry?.contentRect.height ?? 0));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      // The page is white; the content sits on its own cream panel, framed by a little white.
      // --app-gutter is the white around the panel; --app-frame is the frame's height, top and
      // bottom with the panel's border, for screens that fill the window. A stacking context, so
      // the panel can sit behind the content but in front of the white.
      className="bg-frame isolate min-h-dvh [--app-frame:18px] [--app-gutter:8px] [--app-top:56px] lg:pl-[248px] lg:[--app-frame:26px] lg:[--app-gutter:12px] lg:[--app-top:0px]"
      style={{ "--app-banner": `${bannerHeight}px` } as CSSProperties}
    >
      <a
        href="#main"
        className="bg-ink text-cream rounded-btn fixed top-3 left-3 z-[90] -translate-y-20 px-3 py-2 text-sm font-medium transition-transform focus:translate-y-0"
      >
        Skip to the content
      </a>

      {/* Sidebar */}
      <aside className="bg-frame fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col lg:flex">
        <Sidebar />
      </aside>

      {/* Top bar */}
      <header className="bg-frame/90 sticky top-0 z-30 flex h-14 items-center justify-between gap-3 px-3 backdrop-blur-md lg:hidden">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            aria-expanded={navOpen}
            className="rounded-btn text-ink hover:bg-wash flex size-10 shrink-0 items-center justify-center transition-colors"
          >
            <Menu className="size-5" />
          </button>
          <Link href={shopHref(shop.id)} aria-label={`${shop.name}: home`} className="rounded-md">
            <Logo className="h-7" />
          </Link>
        </div>
        <div className="flex items-center gap-0.5">
          <Notifications placement="bottom-end" />
          <UserMenu compact placement="bottom-end" />
        </div>
      </header>
      <Sheet open={navOpen} onClose={closeNav} title="Navigation" side="left" header={false}>
        <Sidebar onNavigate={closeNav} inSheet />
      </Sheet>

      {/*
        The panel is a fixed shape the size of the window, so it always fills it, while the page
        itself scrolls (its scrollbar stays the window's). The content scrolls over the panel, and
        two caps, its rounded top and bottom edges, hide whatever scrolls past them in the frame.
      */}
      <div
        aria-hidden
        className="rounded-panel border-line-soft bg-cream pointer-events-none fixed top-[calc(var(--app-top)+8px)] right-2 bottom-2 left-2 -z-10 border lg:top-3 lg:right-3 lg:bottom-3 lg:left-[260px]"
      />
      <div
        aria-hidden
        className="rounded-t-panel border-line-soft pointer-events-none fixed top-[calc(var(--app-top)+8px)] right-2 left-2 z-[15] h-[14px] border-x border-t shadow-[0_0_0_48px_var(--color-frame)] [clip-path:inset(-48px_-48px_0_-48px)] lg:top-3 lg:right-3 lg:left-[260px]"
      />
      <div
        aria-hidden
        className="rounded-b-panel border-line-soft pointer-events-none fixed right-2 bottom-2 left-2 z-[15] h-[14px] border-x border-b shadow-[0_0_0_48px_var(--color-frame)] [clip-path:inset(0_-48px_-48px_-48px)] lg:right-3 lg:bottom-3 lg:left-[260px]"
      />

      <div className="p-2 lg:p-3">
        <main
          id="main"
          tabIndex={-1}
          className="min-h-[calc(100dvh-var(--app-top)-var(--app-frame))] min-w-0 border border-transparent outline-none lg:min-h-[calc(100dvh-var(--app-frame))]"
        >
          <div ref={measureBanners}>
            <ShellBanners />
          </div>
          {children}
        </main>
      </div>

      <AskSheet />
    </div>
  );
}

function Sidebar({ onNavigate, inSheet = false }: { onNavigate?: () => void; inSheet?: boolean }) {
  const shop = useShop();
  const pathname = usePathname();
  const nav = useNav(shop.id, shop.orderHistory === "full");
  // The storefront sells through PayPal's sandbox, so it belongs next to sample and test shops.
  const storefront = shop.kind === "sample" || shop.paypal?.environment === "sandbox";

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 pr-3 pl-5">
        <Link
          href={shopHref(shop.id)}
          aria-label={`${shop.name}: home`}
          onClick={onNavigate}
          className="rounded-md"
        >
          <Logo className="h-8" />
        </Link>
        {!inSheet && <Notifications />}
      </div>

      <div className="px-3">
        <ShopSwitcher onNavigate={onNavigate} />

        <nav aria-label="App" className="mt-5 space-y-0.5">
          {nav.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group rounded-btn relative flex h-9 items-center gap-2.5 px-2.5 text-sm font-medium transition-colors",
                  // The active item sits on lemon, so its text stays dark in both themes.
                  active ? "text-on-lemon" : "text-ink-2 hover:bg-wash hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId={inSheet ? "nav-active-sheet" : "nav-active"}
                    transition={spring.snappy}
                    className="rounded-btn bg-lemon absolute inset-0"
                  />
                )}
                <span
                  className={cn(
                    "relative [&_svg]:size-[18px]",
                    active ? "text-on-lemon" : "text-ink-3 group-hover:text-ink-2",
                  )}
                >
                  {item.icon}
                </span>
                <span className="relative flex-1">{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <CountBadge value={item.count} active={active} className="relative" />
                )}
              </Link>
            );
          })}
          {storefront && (
            <a
              href="/shop"
              target="_blank"
              rel="noopener"
              onClick={onNavigate}
              className="group rounded-btn text-ink-2 hover:bg-wash hover:text-ink flex h-9 items-center gap-2.5 px-2.5 text-sm font-medium transition-colors"
            >
              <Store className="text-ink-3 group-hover:text-ink-2 size-[18px]" />
              <span className="flex-1">Demo storefront</span>
              <ArrowUpRight className="text-ink-3 size-3.5" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </nav>
      </div>

      <div className="mt-auto px-3 pt-6 pb-3">
        <div className="border-line-soft border-t pt-2">
          <UserMenu onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  );
}
