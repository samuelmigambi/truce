"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { AuthFailure, authConfig, clearStaleSignIn } from "@/lib/client/auth";
import { duration, ease } from "../motion";
import { Button } from "../ui/button";

/**
 * Pieces the sign-in pages share: setting the page up as it opens, the "or" between the two ways
 * in, and the Google button.
 */

/**
 * Runs as a sign-in page opens: forgets a leftover Firebase sign-in (the server has no session,
 * or the page would have sent the person on), and asks the server whether Google is on.
 */
export function useAuthPage(): { google: boolean } {
  const [google, setGoogle] = useState(false);
  useEffect(() => {
    clearStaleSignIn();
    let live = true;
    authConfig()
      .then((config) => {
        if (live) setGoogle(config.google);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return { google };
}

/** Any thrown value as an AuthFailure, so every form handles one shape. */
export function asFailure(error: unknown): AuthFailure {
  if (error instanceof AuthFailure) return error;
  return new AuthFailure("unknown", "Something went wrong. Try again in a moment.");
}

/** Moves focus to a field by id, selecting what's typed so it can be replaced at once. */
export function focusField(id: string, select = false) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) return;
  el.focus();
  if (select) el.select();
}

/** The quiet "or" between signing in with a password and with Google. */
export function OrDivider() {
  return (
    <div className="text-ink-3 my-5 flex items-center gap-3 text-xs">
      <span aria-hidden className="bg-line h-px flex-1" />
      or
      <span aria-hidden className="bg-line h-px flex-1" />
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className="size-[18px]">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * "Continue with Google", shown only when the server turns it on. It eases in once the config
 * arrives, below the password form, so nothing the person is typing into moves.
 */
export function GoogleOption({
  enabled,
  busy,
  disabled,
  onClick,
}: {
  enabled: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <AnimatePresence initial={false}>
      {enabled && (
        <motion.div
          key="google"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: duration.base, ease: ease.out }}
          className="overflow-hidden"
        >
          <OrDivider />
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            icon={<GoogleMark />}
            loading={busy}
            disabled={disabled}
            onClick={onClick}
          >
            Continue with Google
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
