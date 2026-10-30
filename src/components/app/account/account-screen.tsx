"use client";

import { motion } from "motion/react";
import { ArrowRight, BadgeCheck, MailWarning } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { refreshMe, updateMyName } from "@/lib/client/actions";
import { errorMessage, fieldErrors, shopHref } from "@/lib/client/api";
import {
  resendVerification,
  sendPasswordReset,
  signOut,
  signOutEverywhere,
} from "@/lib/client/auth";
import { shopState } from "@/lib/client/labels";
import { useMe, useShopId } from "@/lib/client/shop-context";
import { personNameSchema } from "@/lib/validation";
import { duration, ease } from "../../motion";
import { Button } from "../../ui/button";
import { Card, CardBody, CardHeader } from "../../ui/card";
import { Chip } from "../../ui/chip";
import { cn } from "../../ui/cn";
import { Input } from "../../ui/field";
import { FormField } from "../../ui/form-field";
import { useToast } from "../../ui/toast";
import { PageHeader, Screen } from "../page-header";
import { ShopMark } from "../shell/shop-mark";
import { ConfirmSignOut, ConfirmSignOutEverywhere } from "../shell/user-menu";

const ROLE = { owner: "Owner", admin: "Admin", member: "Member" } as const;

/** The person behind the shops: their name, email, password and sessions. */
export function AccountScreen() {
  return (
    <Screen className="max-w-[880px]">
      <PageHeader title="Account" />
      <div className="mt-8 space-y-5">
        <Appear index={0}>
          <NameCard />
        </Appear>
        <Appear index={1}>
          <EmailCard />
        </Appear>
        <Appear index={2}>
          <PasswordCard />
        </Appear>
        <Appear index={3}>
          <SessionsCard />
        </Appear>
        <Appear index={4}>
          <ShopsCard />
        </Appear>
      </div>
    </Screen>
  );
}

function Appear({ index, children }: { index: number; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base, ease: ease.out, delay: index * 0.04 }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Beside an action, how it went, read out when it changes. It's always there (empty until
 * something happens) so screen readers hear the change; empty, it takes no room in its row.
 */
function Said({ text, tone = "ink" }: { text: string | null; tone?: "ink" | "risk" }) {
  return (
    <p
      aria-live="polite"
      className={cn(
        "min-w-0 text-[13px] leading-5 text-pretty",
        tone === "risk" ? "text-risk-700" : "text-ink-2",
      )}
    >
      {text}
    </p>
  );
}

function NameCard() {
  const { user } = useMe();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [saved, setSaved] = useState(user.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Saved somewhere else (another tab, onboarding): show it, unless the box has edits.
  if (user.name !== saved) {
    if (name === saved) setName(user.name);
    setSaved(user.name);
  }

  const dirty = name.trim() !== user.name;

  async function save(event: FormEvent) {
    event.preventDefault();
    const parsed = personNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter your name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateMyName(parsed.data);
      setName(parsed.data);
      toast({ title: "Name saved", description: "Truce uses it in the app and in emails to you." });
    } catch (e) {
      setError(fieldErrors(e).name ?? errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Your name" description="What Truce calls you" />
      <CardBody>
        <form
          onSubmit={save}
          className="flex max-w-[560px] flex-col gap-3 sm:flex-row sm:items-start"
          noValidate
        >
          <FormField id="account-name" label="Name" error={error} className="min-w-0 flex-1">
            {(control) => (
              <Input
                {...control}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                disabled={saving}
                autoComplete="name"
                maxLength={60}
              />
            )}
          </FormField>
          <Button type="submit" loading={saving} disabled={!dirty} className="sm:mt-[26px]">
            Save
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

type Status = { text: string; tone?: "ink" | "risk" } | null;

function EmailCard() {
  const { user } = useMe();
  const toast = useToast();
  const [busy, setBusy] = useState<"resend" | "check" | null>(null);
  const [status, setStatus] = useState<Status>(null);

  async function resend() {
    setBusy("resend");
    try {
      const result = await resendVerification();
      setStatus(
        result === "sent"
          ? { text: `Sent. Check ${user.email} for the link.` }
          : {
              text: "Sign in again to get a new link: this browser's sign-in has expired.",
              tone: "risk",
            },
      );
    } catch (e) {
      setStatus({ text: errorMessage(e), tone: "risk" });
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    setBusy("check");
    try {
      const me = await refreshMe();
      if (me.user.emailVerified) {
        setStatus(null);
        toast({ title: "Email verified", description: "Thanks. Your address is confirmed." });
      } else {
        setStatus({ text: "Not verified yet. Open the link in the email, then try again." });
      }
    } catch (e) {
      setStatus({ text: errorMessage(e), tone: "risk" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader title="Email" description="Where Truce sends sign-in links and alerts" />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="text-ink text-[15px] font-medium break-all">{user.email}</p>
          {user.emailVerified ? (
            <Chip tone="moss" size="sm" icon={<BadgeCheck />}>
              Verified
            </Chip>
          ) : (
            <Chip tone="warn" size="sm" icon={<MailWarning />}>
              Not verified
            </Chip>
          )}
          {user.emailVerified && <Said text={status?.text ?? null} tone={status?.tone} />}
        </div>
        {!user.emailVerified && (
          <>
            <p className="text-ink-2 text-[13px] leading-relaxed">
              Truce sent a link to this address when you signed up. Open it to show the address is
              yours.
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={resend}
                  loading={busy === "resend"}
                  disabled={busy !== null}
                >
                  Resend the link
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={check}
                  loading={busy === "check"}
                  disabled={busy !== null}
                >
                  I&rsquo;ve verified it
                </Button>
              </div>
              <Said text={status?.text ?? null} tone={status?.tone} />
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function PasswordCard() {
  const { user } = useMe();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function send() {
    setBusy(true);
    try {
      await sendPasswordReset(user.email);
      setStatus({ text: `Sent. The link in ${user.email} lets you choose a new password.` });
    } catch (e) {
      setStatus({ text: errorMessage(e), tone: "risk" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Password" description="Change it with a link sent to your email" />
      <CardBody>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button variant="secondary" size="sm" onClick={send} loading={busy}>
            Send a password reset link
          </Button>
          <Said text={status?.text ?? null} tone={status?.tone} />
        </div>
      </CardBody>
    </Card>
  );
}

function SessionsCard() {
  const toast = useToast();
  const [leaving, setLeaving] = useState<"here" | "everywhere" | null>(null);
  const [confirming, setConfirming] = useState<"here" | "everywhere" | null>(null);

  async function everywhere() {
    setLeaving("everywhere");
    try {
      await signOutEverywhere();
    } catch (e) {
      setLeaving(null);
      toast({ title: "Couldn't sign out everywhere", description: errorMessage(e), tone: "error" });
    }
  }

  return (
    <Card>
      <CardHeader
        title="Signing out"
        description="Leave this browser, or every browser and device at once"
      />
      <CardBody>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={leaving !== null}
            onClick={() => setConfirming("here")}
          >
            Sign out
          </Button>
          <Button
            variant="secondary"
            disabled={leaving !== null}
            onClick={() => setConfirming("everywhere")}
          >
            Sign out everywhere
          </Button>
        </div>
        <p className="text-ink-2 mt-3 text-[13px] leading-relaxed">
          Signing out everywhere ends every session on every device, this one included. Use it if
          you signed in on a computer that isn&rsquo;t yours.
        </p>
      </CardBody>
      <ConfirmSignOut
        open={confirming === "here"}
        busy={leaving === "here"}
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          setLeaving("here");
          void signOut();
        }}
      />
      <ConfirmSignOutEverywhere
        open={confirming === "everywhere"}
        busy={leaving === "everywhere"}
        onClose={() => setConfirming(null)}
        onConfirm={everywhere}
      />
    </Card>
  );
}

function ShopsCard() {
  const { shops } = useMe();
  const shopId = useShopId();
  return (
    <Card>
      <CardHeader title="Your shops" description="Each with its own PayPal connection and team" />
      <CardBody>
        <ul className="divide-line-soft border-line-soft divide-y rounded-[10px] border">
          {shops.map((s) => {
            const ready = s.status === "ready";
            const href = ready ? shopHref(s.id) : `/onboarding?shop=${encodeURIComponent(s.id)}`;
            return (
              <li key={s.id}>
                <Link
                  href={href}
                  className="group hover:bg-cream/70 flex items-center gap-3 px-3.5 py-3 transition-colors focus-visible:-outline-offset-2"
                >
                  <ShopMark name={s.name || "New shop"} />
                  <span className="min-w-0 flex-1">
                    <span className="text-ink block truncate text-sm font-medium">
                      {s.name || "New shop"}
                    </span>
                    <span className="text-ink-2 block text-xs">
                      {ROLE[s.role]} · {ready ? shopState(s).label : "Setup not finished"}
                    </span>
                  </span>
                  {s.id === shopId ? (
                    <Chip tone="mist" size="sm">
                      Open now
                    </Chip>
                  ) : (
                    <span className="text-moss flex shrink-0 items-center gap-1 text-[13px] font-medium">
                      {ready ? "Open" : "Finish setup"}
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <Link
          href="/onboarding?new=1"
          className="text-moss hover:text-moss-deep mt-3 inline-flex items-center gap-1 text-[13px] font-medium transition-colors"
        >
          Add a shop
          <ArrowRight className="size-3.5" />
        </Link>
      </CardBody>
    </Card>
  );
}
