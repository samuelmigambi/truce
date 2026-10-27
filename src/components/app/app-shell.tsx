"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  Inbox,
  Menu,
  MessagesSquare,
  Package,
  RotateCcw,
  Settings2,
  Store,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { resetDemo } from "@/lib/client/actions";
import { errorMessage } from "@/lib/client/api";
import { openAsk } from "@/lib/client/ask";
import { clearChat } from "@/lib/client/chat";
import { useCases, useOrders, useSession } from "@/lib/client/hooks";
import { useModKey } from "@/lib/client/platform";
import { rememberCopy, useFirstVisit } from "@/lib/client/visit";
import type { Workspace } from "@/lib/domain";
import { spring } from "../motion";
import { Button } from "../ui/button";
import { CountBadge } from "../ui/chip";
import { cn } from "../ui/cn";
import { EmptyState } from "../ui/empty-state";
import { Kbd } from "../ui/kbd";
import { Logo, LogoTile } from "../ui/logo";
import { Dialog, Sheet } from "../ui/overlay";
import { Skeleton } from "../ui/skeleton";
import { useToast } from "../ui/toast";
import { AskSheet } from "./ask/ask-sheet";
import { ModeChip } from "./mode-chip";
import { SettingUp } from "./setting-up";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  count?: number;
  match: (path: string) => boolean;
}

function useNav(): NavItem[] {
  const cases = useCases().data?.cases;
  const orders = useOrders().data?.orders;
  return [
    {
      href: "/app",
      label: "Cases",
      icon: <Inbox />,
      count: cases?.filter((c) => c.status === "needs_you").length,
      match: (p) => p === "/app" || p.startsWith("/app/cases"),
    },
    {
      href: "/app/orders",
      label: "Orders",
      icon: <Package />,
      count: orders?.filter((o) => o.status === "paid").length,
      match: (p) => p.startsWith("/app/orders"),
    },
    {
      href: "/app/health",
      label: "Shop health",
      icon: <Activity />,
      match: (p) => p.startsWith("/app/health"),
    },
    {
      href: "/app/ask",
      label: "Ask Truce",
      icon: <MessagesSquare />,
      match: (p) => p.startsWith("/app/ask"),
    },
  ];
}

/**
 * The app around every screen: a sidebar on wide screens, a top bar and a sheet on narrow ones,
 * the mode chip, and Ask Truce one shortcut away. Screens render once the session exists.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const [navOpen, setNavOpen] = useState(false);
  const workspace = session.data?.workspace ?? null;
  const firstVisit = useFirstVisit();

  // Next time, this browser gets quiet skeletons instead of the welcome.
  useEffect(() => {
    if (workspace) rememberCopy(workspace);
  }, [workspace]);

  return (
    <div className="min-h-dvh lg:pl-[248px]">
      {/* Sidebar */}
      <aside className="border-line-soft bg-cream fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r lg:flex">
        <SidebarContent workspace={workspace} />
      </aside>

      {/* Top bar */}
      <header className="border-line-soft bg-cream/90 sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b px-3 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            className="rounded-btn text-ink hover:bg-wash flex size-10 items-center justify-center transition-colors"
          >
            <Menu className="size-5" />
          </button>
          <Link href="/app" aria-label="Truce cases" className="rounded-md">
            <Logo className="h-7" />
          </Link>
        </div>
        {workspace && <ModeChip workspace={workspace} compact />}
      </header>
      <Sheet
        open={navOpen}
        onClose={() => setNavOpen(false)}
        title="Navigation"
        side="left"
        header={false}
      >
        <SidebarContent workspace={workspace} onNavigate={() => setNavOpen(false)} />
      </Sheet>

      <main id="main" className="min-w-0">
        <AnimatePresence mode="wait" initial={false}>
          {session.error ? (
            <div key="error">
              <EmptyState
                tone="error"
                className="pt-32"
                icon={<RotateCcw />}
                title="Truce couldn't start your demo copy"
                description={errorMessage(session.error)}
                action={<Button onClick={() => void session.mutate()}>Try again</Button>}
              />
            </div>
          ) : workspace ? (
            <div key="app">{children}</div>
          ) : firstVisit ? (
            <SettingUp key="setup" />
          ) : (
            <ShellSkeleton key="skeleton" />
          )}
        </AnimatePresence>
      </main>

      {workspace && <AskSheet />}
    </div>
  );
}

function SidebarContent({
  workspace,
  onNavigate,
}: {
  workspace: Workspace | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const nav = useNav();
  const mod = useModKey();
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const toast = useToast();

  async function reset() {
    setResetting(true);
    try {
      await resetDemo();
      clearChat();
      setConfirming(false);
      onNavigate?.();
      toast({
        title: "Demo reset",
        description: "Every case, order and approval is back to the start.",
      });
    } catch (error) {
      toast({ title: "Couldn't reset the demo", description: errorMessage(error), tone: "error" });
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Link href="/" aria-label="Truce home" onClick={onNavigate} className="rounded-md">
          <Logo className="h-8" />
        </Link>
      </div>

      <div className="px-3 pt-1">
        <p className="text-ink-3 truncate px-2 pb-2 text-xs">
          {workspace?.shopName ?? "Wick & Ember"}
        </p>
        <nav aria-label="App" className="space-y-0.5">
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
                  active ? "text-ink" : "text-ink-2 hover:bg-wash hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId={onNavigate ? "nav-active-sheet" : "nav-active"}
                    transition={spring.snappy}
                    className="rounded-btn bg-lemon absolute inset-0"
                  />
                )}
                <span
                  className={cn(
                    "relative [&_svg]:size-[18px]",
                    active ? "text-ink" : "text-ink-3 group-hover:text-ink-2",
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
        </nav>

        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            openAsk();
          }}
          className="rounded-btn border-line bg-paper text-ink-2 hover:border-line-strong hover:text-ink mt-4 flex w-full items-center gap-2.5 border px-2.5 py-2 text-left text-[13px] transition-colors"
        >
          <LogoTile className="size-5" />
          <span className="flex-1">Ask anything</span>
          <span className="flex gap-0.5 max-lg:hidden">
            <Kbd>{mod}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
      </div>

      <div className="mt-auto space-y-1 px-3 pb-4">
        <Link
          href="/shop"
          onClick={onNavigate}
          className="rounded-btn text-ink-2 hover:bg-wash hover:text-ink flex h-9 items-center gap-2.5 px-2.5 text-sm font-medium transition-colors"
        >
          <Store className="text-ink-3 size-[18px]" />
          Demo shop
        </Link>
        <Link
          href="/app/settings"
          onClick={onNavigate}
          aria-current={pathname.startsWith("/app/settings") ? "page" : undefined}
          className={cn(
            "rounded-btn flex h-9 items-center gap-2.5 px-2.5 text-sm font-medium transition-colors",
            pathname.startsWith("/app/settings")
              ? "bg-wash text-ink"
              : "text-ink-2 hover:bg-wash hover:text-ink",
          )}
        >
          <Settings2 className="text-ink-3 size-[18px]" />
          Settings
        </Link>
        <div className="rounded-card border-line-soft bg-paper mt-3 border p-3">
          {workspace ? (
            <>
              <ModeChip workspace={workspace} />
              <p className="text-ink-2 mt-2 text-xs leading-relaxed">
                {workspace.kind === "demo"
                  ? "Nemotron runs for real. PayPal calls are simulated."
                  : "Approvals call the PayPal sandbox."}
              </p>
              {workspace.kind === "demo" && (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="border-line text-ink-2 hover:border-line-strong hover:text-ink mt-2.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors"
                >
                  <RotateCcw className="size-3" />
                  Reset demo
                </button>
              )}
            </>
          ) : (
            <Skeleton className="h-16" />
          )}
        </div>
      </div>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Reset your demo copy?"
        description="Every case, order and approval goes back to the start. Saved analyses replay from their recorded runs."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button onClick={reset} loading={resetting} data-autofocus>
              Reset demo
            </Button>
          </>
        }
      />
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-8 sm:px-8" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-3 h-4 w-64" />
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="rounded-card h-24" />
        ))}
      </div>
      <Skeleton className="rounded-card mt-8 h-[360px]" />
    </div>
  );
}
