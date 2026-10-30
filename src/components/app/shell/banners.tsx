"use client";

import { AnimatePresence, motion } from "motion/react";
import { MailCheck, PlugZap, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { refreshMe } from "@/lib/client/actions";
import { errorMessage, shopHref } from "@/lib/client/api";
import { resendVerification, signOut } from "@/lib/client/auth";
import { useMe, useShop } from "@/lib/client/shop-context";
import { duration, ease } from "../../motion";
import { Button } from "../../ui/button";
import { cn } from "../../ui/cn";
import { useToast } from "../../ui/toast";

/**
 * Slim strips across the top of every screen, for the few things that matter everywhere: an
 * email address still to verify, and a PayPal connection that needs the seller.
 */
export function ShellBanners() {
  const { user } = useMe();
  const shop = useShop();
  const pathname = usePathname();
  const [hideVerify, setHideVerify] = useState(false);
  // Settings shows the connection in full, so the strip would only repeat it there.
  const onSettings = pathname.startsWith(shopHref(shop.id, "settings"));
  const connection =
    shop.kind === "real" && !onSettings && (!shop.paypal || shop.paypal.health === "error");

  return (
    <AnimatePresence initial={false}>
      {!user.emailVerified && !hideVerify && (
        <Reveal key="verify">
          <VerifyEmail email={user.email} onHide={() => setHideVerify(true)} />
        </Reveal>
      )}
      {connection && (
        <Reveal key="paypal">
          <ConnectionStrip />
        </Reveal>
      )}
    </AnimatePresence>
  );
}

function Reveal({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{
        height: "auto",
        opacity: 1,
        transition: { duration: duration.slow, ease: ease.out },
      }}
      exit={{ height: 0, opacity: 0, transition: { duration: duration.base, ease: ease.in } }}
      className="overflow-hidden"
    >
      {children}
    </motion.div>
  );
}

function Strip({
  tone,
  icon,
  children,
  actions,
}: {
  tone: "info" | "warn";
  icon: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-b px-4 py-2.5 sm:px-8",
        tone === "warn" ? "border-warn-200 bg-warn-50" : "bg-mist/70 border-mist-line",
      )}
    >
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-[280px] items-start gap-2.5">
          <span
            aria-hidden
            className={cn(
              "mt-px shrink-0 [&_svg]:size-4",
              tone === "warn" ? "text-warn-700" : "text-moss-deep",
            )}
          >
            {icon}
          </span>
          <div className="text-ink min-w-0 text-[13px] leading-relaxed">{children}</div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>}
      </div>
    </div>
  );
}

type VerifyState =
  | { kind: "idle" }
  | { kind: "busy"; doing: "resend" | "check" }
  | { kind: "said"; text: string; signIn?: boolean };

/** Until the address is verified: send the link again, or check that it's been opened. */
function VerifyEmail({ email, onHide }: { email: string; onHide: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<VerifyState>({ kind: "idle" });
  const busy = state.kind === "busy";

  async function resend() {
    setState({ kind: "busy", doing: "resend" });
    try {
      const result = await resendVerification();
      setState(
        result === "sent"
          ? { kind: "said", text: `Sent. Check ${email} for the link.` }
          : { kind: "said", text: "Sign in again to get a new link.", signIn: true },
      );
    } catch (e) {
      setState({ kind: "said", text: errorMessage(e) });
    }
  }

  async function check() {
    setState({ kind: "busy", doing: "check" });
    try {
      const me = await refreshMe();
      if (me.user.emailVerified) {
        toast({ title: "Email verified", description: "Thanks. Your address is confirmed." });
        return;
      }
      setState({
        kind: "said",
        text: "Not verified yet. Open the link in the email, then try again.",
      });
    } catch (e) {
      setState({ kind: "said", text: errorMessage(e) });
    }
  }

  return (
    <Strip
      tone="info"
      icon={<MailCheck />}
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={resend}
            loading={busy && state.doing === "resend"}
            disabled={busy}
          >
            Resend the link
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={check}
            loading={busy && state.doing === "check"}
            disabled={busy}
          >
            I&rsquo;ve verified it
          </Button>
          <button
            type="button"
            onClick={onHide}
            aria-label="Hide this until next time"
            title="Hide this until next time"
            className="text-ink-3 hover:bg-wash hover:text-ink flex size-8 items-center justify-center rounded-lg transition-colors"
          >
            <X className="size-4" />
          </button>
        </>
      }
    >
      <span className="font-medium">Verify your email address.</span>{" "}
      <span className="text-ink-2">
        We sent a link to <span className="text-ink">{email}</span>.
      </span>{" "}
      <span aria-live="polite" className="text-ink-2">
        {state.kind === "said" && (
          <>
            <span className="text-ink font-medium">{state.text}</span>
            {state.signIn && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="text-moss font-medium underline-offset-4 hover:underline"
                >
                  Sign in again
                </button>
              </>
            )}
          </>
        )}
      </span>
    </Strip>
  );
}

/** A real shop that can't reach PayPal: nothing can be read or sent until that's fixed. */
function ConnectionStrip() {
  const shop = useShop();
  const href = shopHref(shop.id, "settings#paypal");
  const missing = !shop.paypal;
  return (
    <Strip
      tone="warn"
      icon={<PlugZap />}
      actions={
        <Link
          href={href}
          className="text-warn-700 rounded-lg px-2 py-1 text-[13px] font-medium underline-offset-4 hover:underline"
        >
          {missing ? "Connect PayPal" : "Check the connection"}
        </Link>
      }
    >
      <span className="font-medium">
        {missing ? "PayPal isn't connected." : "PayPal needs attention."}
      </span>{" "}
      <span className="text-ink-2">
        {missing
          ? "Truce can't see new disputes or send your answers until it is."
          : (shop.paypal?.problem ??
            "Truce couldn't reach PayPal with this shop's keys, so nothing can be read or sent.")}
      </span>
    </Strip>
  );
}
