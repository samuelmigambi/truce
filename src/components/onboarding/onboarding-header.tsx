"use client";

import { LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { signOut } from "@/lib/client/auth";
import type { User } from "@/lib/domain";
import { ConfirmSignOut } from "../app/shell/user-menu";
import { Avatar } from "../ui/avatar";
import { cn } from "../ui/cn";
import { Logo } from "../ui/logo";
import { MenuButton, MenuDivider, Popover, triggerProps, usePopover } from "../ui/popover";
import { ThemeMenuRow } from "../ui/theme-switch";

/**
 * Onboarding's top bar: the logo, and the person's avatar with a menu holding the way back to
 * the dashboard (for someone who already has a ready shop) and signing out.
 */
export function OnboardingHeader({
  user,
  dashboardHref,
}: {
  user: User;
  /** The ready shop to go back to, if there is one. */
  dashboardHref: string | null;
}) {
  const control = usePopover();
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const name = user.name || user.email;

  return (
    <header className="bg-cream/85 sticky top-0 z-30 backdrop-blur-md">
      <div className="flex h-16 w-full items-center justify-between gap-4 px-4 sm:px-8">
        <Link href="/" aria-label="Truce home" className="shrink-0 rounded-md">
          <Logo className="h-7 sm:h-8" />
        </Link>

        <button
          {...triggerProps(control, "menu")}
          aria-label={`Account: ${name}`}
          className={cn(
            "hover:ring-moss/20 rounded-full ring-0 ring-transparent transition-[box-shadow] duration-150 hover:ring-4",
            control.open && "ring-moss/20 ring-4",
          )}
        >
          <Avatar name={name} size="account" tone="brand" />
        </button>
      </div>

      <Popover
        control={control}
        kind="menu"
        label="Your account"
        placement="bottom-end"
        width={260}
      >
        <div className="p-1.5">
          <div className="px-2.5 pt-1.5 pb-2">
            <p className="text-ink truncate text-[13.5px] font-medium">{name}</p>
            <p className="text-ink-2 truncate text-xs">{user.email}</p>
          </div>
          {dashboardHref && (
            <>
              <MenuDivider />
              {/* A full page load, so the app's layout checks the shop afresh. */}
              <MenuButton onClick={() => window.location.assign(dashboardHref)}>
                <LayoutDashboard />
                Back to your dashboard
              </MenuButton>
            </>
          )}
          <MenuDivider />
          <ThemeMenuRow />
          <MenuDivider />
          <MenuButton
            onClick={() => {
              control.hide();
              setConfirming(true);
            }}
          >
            <LogOut />
            Sign out
          </MenuButton>
        </div>
      </Popover>

      <ConfirmSignOut
        open={confirming}
        busy={leaving}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setLeaving(true);
          void signOut();
        }}
      />
    </header>
  );
}
