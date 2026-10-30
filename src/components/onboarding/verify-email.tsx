"use client";

import { motion } from "motion/react";
import { Check, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import type { MeResponse } from "@/lib/api-types";
import { errorMessage, getJson } from "@/lib/client/api";
import { AuthFailure, resendVerification, signOut } from "@/lib/client/auth";
import type { User } from "@/lib/domain";
import { spring } from "../motion";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { useToast } from "../ui/toast";

/** What the card is doing; how it went shows as a toast. */
type Status = "idle" | "sending" | "checking";

/**
 * The email check, which never blocks setup: a note that the link was sent, a way to send it
 * again, and a way to say it's done. A verified address shows as a quiet confirmation.
 */
export function VerifyEmail({
  user,
  onVerified,
  compact = false,
}: {
  user: User;
  onVerified: (user: User) => void;
  compact?: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const toast = useToast();
  const verified = user.emailVerified;

  // Coming back from the email's tab checks again, quietly, at most every 15 seconds.
  useEffect(() => {
    if (verified) return;
    let last = 0;
    function recheck() {
      if (document.visibilityState !== "visible" || Date.now() - last < 15_000) return;
      last = Date.now();
      getJson<MeResponse>("/api/me?refresh=1")
        .then((me) => {
          if (me.user.emailVerified) onVerified(me.user);
        })
        .catch(() => undefined);
    }
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
    };
  }, [verified, onVerified]);

  if (verified) {
    return (
      <p className="text-moss-deep flex items-center gap-2 text-[13px] font-medium">
        <motion.span
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring.pop}
          className="bg-lemon text-ink flex size-[18px] items-center justify-center rounded-full"
        >
          <Check aria-hidden className="size-3" strokeWidth={3} />
        </motion.span>
        {user.email} is verified
      </p>
    );
  }

  async function resend() {
    setStatus("sending");
    try {
      const result = await resendVerification();
      if (result === "sent") {
        toast({
          key: "verify",
          title: "Sent",
          description: "Check your inbox, and the spam folder too.",
        });
      } else {
        toast({
          key: "verify",
          tone: "warning",
          title: "To send a new link, sign in again first.",
          action: { label: "Sign in again", onClick: () => void signOut() },
        });
      }
    } catch (error) {
      toast({
        key: "verify",
        tone: "error",
        title: error instanceof AuthFailure ? error.message : errorMessage(error),
      });
    }
    setStatus("idle");
  }

  async function check() {
    setStatus("checking");
    try {
      const me = await getJson<MeResponse>("/api/me?refresh=1");
      if (me.user.emailVerified) onVerified(me.user);
      else {
        toast({
          key: "verify",
          tone: "warning",
          title: "It isn't verified yet.",
          description: "Open the link in the email, then try again.",
        });
      }
    } catch (error) {
      toast({ key: "verify", tone: "error", title: errorMessage(error) });
    }
    setStatus("idle");
  }

  const busy = status !== "idle";

  return (
    <div
      className={cn("rounded-card bg-mist/70 border-mist-line border", compact ? "p-3.5" : "p-4")}
    >
      <div className="flex gap-3">
        <span
          aria-hidden
          className="rounded-btn bg-paper text-moss-deep flex size-8 shrink-0 items-center justify-center"
        >
          <Mail className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-ink text-sm font-medium">Verify your email</p>
          <p className="text-ink-2 mt-0.5 text-[13px] leading-5 text-pretty">
            We sent a link to <span className="text-ink font-medium break-words">{user.email}</span>
            . You can carry on and verify when you&rsquo;re ready.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={resend}
              loading={status === "sending"}
              disabled={busy}
            >
              Resend the link
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={check}
              loading={status === "checking"}
              disabled={busy}
            >
              I&rsquo;ve verified it
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
