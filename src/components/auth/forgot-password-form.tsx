"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, MailCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { sendPasswordReset } from "@/lib/client/auth";
import { emailSchema } from "@/lib/validation";
import { duration, ease, spring } from "../motion";
import { Button, ButtonLink } from "../ui/button";
import { Input } from "../ui/field";
import { FormField } from "../ui/form-field";
import { useToast } from "../ui/toast";
import { AuthCard } from "./auth-shell";
import { asFailure, focusField, useAuthPage } from "./auth-parts";
import { withNext } from "./next-path";

const EMAIL_ID = "reset-email";

/**
 * Asking for a password reset link. The answer is the same whether or not there's an account
 * for the address, so the page never tells anyone who has one.
 */
export function ForgotPasswordForm({ next }: { next: string | null }) {
  useAuthPage();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [restarted, setRestarted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      focusField(EMAIL_ID);
      return;
    }
    setError(undefined);
    setSending(true);
    try {
      await sendPasswordReset(parsed.data);
      setSentTo(parsed.data);
      setSending(false);
    } catch (problem) {
      flushSync(() => setSending(false));
      toast({ key: "reset", tone: "error", title: asFailure(problem).message });
      focusField(EMAIL_ID, true);
    }
  }

  /** Back to the form; the field takes focus as it reappears. */
  function startOver() {
    setSentTo(null);
    setEmail("");
    setRestarted(true);
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {sentTo ? (
        <motion.div
          key="sent"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration.base, ease: ease.out }}
        >
          <Sent email={sentTo} next={next} onStartOver={startOver} />
        </motion.div>
      ) : (
        <motion.div
          key="form"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration.base, ease: ease.out }}
        >
          <AuthCard
            title="Reset your password"
            footer={
              <Link
                href={withNext("/signin", next)}
                className="text-moss-deep inline-flex items-center gap-1.5 font-medium hover:underline"
              >
                <ArrowLeft aria-hidden className="size-3.5" />
                Back to sign in
              </Link>
            }
          >
            <form method="post" noValidate onSubmit={submit} aria-label="Reset your password">
              <FormField id={EMAIL_ID} label="Email" error={error}>
                {(control) => (
                  <Input
                    {...control}
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@yourshop.com"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (error) setError(undefined);
                    }}
                    disabled={sending}
                    maxLength={254}
                    autoFocus={restarted}
                  />
                )}
              </FormField>
              <Button type="submit" size="lg" className="mt-6 w-full" loading={sending}>
                {sending ? "Sending…" : "Send the reset link"}
              </Button>
            </form>
          </AuthCard>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Sent({
  email,
  next,
  onStartOver,
}: {
  email: string;
  next: string | null;
  onStartOver: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="rounded-panel border-line bg-paper border p-6 text-center sm:p-8">
      <motion.span
        aria-hidden
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...spring.pop, delay: 0.08 }}
        className="bg-lemon text-ink mx-auto flex size-12 items-center justify-center rounded-full"
      >
        <MailCheck className="size-5" />
      </motion.span>
      <h1
        ref={heading}
        tabIndex={-1}
        className="text-ink mt-5 text-[22px] leading-tight font-semibold tracking-[-0.02em] focus:outline-none"
      >
        Check your email
      </h1>
      <p role="status" className="text-ink-2 mt-2 text-[15px] leading-relaxed text-pretty">
        If there&rsquo;s a Truce account for{" "}
        <span className="text-ink font-medium break-words">{email}</span>, a link to reset its
        password is on its way. It can take a minute or two, and it may land in spam.
      </p>
      <div className="mt-7 flex flex-col gap-2.5">
        <ButtonLink href={withNext("/signin", next)} size="lg" className="w-full">
          Back to sign in
        </ButtonLink>
        <Button variant="ghost" onClick={onStartOver} className="w-full">
          Use a different email
        </Button>
      </div>
    </div>
  );
}
