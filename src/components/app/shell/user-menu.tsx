"use client";

import { ChevronsUpDown, LogOut, UserRound } from "lucide-react";
import { useState } from "react";
import { shopHref } from "@/lib/client/api";
import { signOut } from "@/lib/client/auth";
import { useMe, useShopId } from "@/lib/client/shop-context";
import { Avatar } from "../../ui/avatar";
import { Button } from "../../ui/button";
import { cn } from "../../ui/cn";
import { Dialog } from "../../ui/overlay";
import {
  MenuButton,
  MenuDivider,
  MenuLink,
  Popover,
  triggerProps,
  usePopover,
  type Placement,
} from "../../ui/popover";
import { ThemeMenuRow } from "../../ui/theme-switch";

/**
 * Who's signed in, their account, the theme, and signing out. Signing out everywhere lives on
 * the account page.
 */
export function UserMenu({
  compact = false,
  placement = "top-start",
  onNavigate,
}: {
  /** Just the avatar, for the phone's top bar. */
  compact?: boolean;
  placement?: Placement;
  onNavigate?: () => void;
}) {
  const { user } = useMe();
  const shopId = useShopId();
  const control = usePopover();
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const name = user.name || user.email;

  async function leave() {
    setLeaving(true);
    await signOut();
  }

  return (
    <>
      {compact ? (
        <button
          {...triggerProps(control, "menu")}
          aria-label={`Account: ${name}`}
          className={cn(
            "rounded-btn hover:bg-wash flex size-10 items-center justify-center transition-colors",
            control.open && "bg-wash",
          )}
        >
          <Avatar name={name} size="sm" />
        </button>
      ) : (
        <button
          {...triggerProps(control, "menu")}
          className={cn(
            "rounded-btn hover:bg-wash flex w-full items-center gap-2.5 px-2 py-1.5 text-left transition-colors",
            control.open && "bg-wash",
          )}
        >
          <Avatar name={name} size="md" />
          <span className="text-ink min-w-0 flex-1 truncate text-[13.5px] font-medium">{name}</span>
          <ChevronsUpDown className="text-ink-3 size-4 shrink-0" aria-hidden />
        </button>
      )}

      <Popover
        control={control}
        kind="menu"
        label="Your account"
        placement={placement}
        width={compact ? 260 : "anchor"}
      >
        <div className="p-1.5">
          <div className="px-2.5 pt-1.5 pb-2">
            <p className="text-ink truncate text-[13.5px] font-medium">{name}</p>
            <p className="text-ink-2 truncate text-xs">{user.email}</p>
          </div>
          <MenuDivider />
          <MenuLink
            href={shopHref(shopId, "account")}
            onSelect={() => {
              control.hide();
              onNavigate?.();
            }}
          >
            <UserRound />
            Account
          </MenuLink>
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
        onConfirm={leave}
      />
    </>
  );
}

/** The check before signing out of this browser. */
export function ConfirmSignOut({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Sign out?"
      description="You can sign back in any time. Everything you've set up stays saved."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onConfirm} loading={busy} data-autofocus>
            Sign out
          </Button>
        </>
      }
    />
  );
}

/** The confirmation before every session on every device ends; the account page uses it too. */
export function ConfirmSignOutEverywhere({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Sign out everywhere?"
      description="Every browser and device signed in to your account is signed out, this one included. Your shops and their data stay as they are."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onConfirm} loading={busy} data-autofocus>
            Sign out everywhere
          </Button>
        </>
      }
    />
  );
}
