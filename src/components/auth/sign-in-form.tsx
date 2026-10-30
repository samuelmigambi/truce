"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { safeNext, signIn, signInWithGoogle } from "@/lib/client/auth";
import { emailSchema } from "@/lib/validation";
import { Button } from "../ui/button";
import { Input } from "../ui/field";
import { FormField } from "../ui/form-field";
import { PasswordInput } from "../ui/password-input";
import { useToast } from "../ui/toast";
import { AuthCard } from "./auth-shell";
import { asFailure, focusField, GoogleOption, useAuthPage } from "./auth-parts";
import { withNext } from "./next-path";

type FieldKey = "email" | "password";

const ID: Record<FieldKey, string> = { email: "signin-email", password: "signin-password" };

const FIELD_FOR_CODE: Record<string, FieldKey> = {
  "auth/invalid-email": "email",
  "auth/missing-email": "email",
  "auth/missing-password": "password",
};

/** Codes where the password is the likely culprit, so focus goes back to it. */
const WRONG_PASSWORD = new Set([
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
  "auth/wrong-password",
  "auth/user-not-found",
]);

function check(values: Record<FieldKey, string>): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  const email = emailSchema.safeParse(values.email);
  if (!email.success) errors.email = email.error.issues[0]?.message;
  if (!values.password) errors.password = "Enter your password.";
  return errors;
}

/** Signing in with an email and password, or with Google when it's on. */
export function SignInForm({
  next,
  signedOutEverywhere = false,
}: {
  next: string | null;
  signedOutEverywhere?: boolean;
}) {
  const { google } = useAuthPage();
  const [values, setValues] = useState<Record<FieldKey, string>>({ email: "", password: "" });
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const toast = useToast();
  const [busy, setBusy] = useState<"password" | "google" | null>(null);

  useEffect(() => {
    if (!signedOutEverywhere) return;
    toast({
      key: "signin",
      tone: "info",
      title: "You're signed out on every device.",
      description: "Sign in again to carry on.",
    });
  }, [signedOutEverywhere, toast]);

  function update(key: FieldKey, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  }

  /** Shows why it failed: under the field it's about, or in a toast. */
  function failed(error: unknown) {
    const problem = asFailure(error);
    const field = FIELD_FOR_CODE[problem.code];
    flushSync(() => {
      setBusy(null);
      if (field) setErrors({ [field]: problem.message });
    });
    if (!field) {
      toast({
        key: "signin",
        tone: "error",
        title: problem.message,
        action:
          problem.code === "auth/too-many-requests"
            ? { label: "Reset your password", href: withNext("/forgot-password", next) }
            : undefined,
      });
    }
    if (field) focusField(ID[field]);
    else if (WRONG_PASSWORD.has(problem.code)) focusField(ID.password, true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const found = check(values);
    setErrors(found);
    const first = (["email", "password"] as const).find((key) => found[key]);
    if (first) {
      focusField(ID[first]);
      return;
    }
    setBusy("password");
    try {
      const session = await signIn(values);
      window.location.assign(safeNext(next) ?? session.next);
    } catch (error) {
      failed(error);
    }
  }

  async function continueWithGoogle() {
    if (busy) return;
    setBusy("google");
    try {
      const session = await signInWithGoogle();
      window.location.assign(safeNext(next) ?? session.next);
    } catch (error) {
      failed(error);
    }
  }

  return (
    <AuthCard
      title="Sign in"
      footer={
        <>
          New to Truce?{" "}
          <Link
            href={withNext("/signup", next)}
            className="text-moss-deep font-medium hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form method="post" noValidate onSubmit={submit} aria-label="Sign in">
        <div className="space-y-4">
          <FormField id={ID.email} label="Email" error={errors.email}>
            {(control) => (
              <Input
                {...control}
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@yourshop.com"
                autoCapitalize="none"
                spellCheck={false}
                value={values.email}
                onChange={(event) => update("email", event.target.value)}
                disabled={busy !== null}
                maxLength={254}
              />
            )}
          </FormField>
          <div>
            <FormField id={ID.password} label="Password" error={errors.password}>
              {(control) => (
                <PasswordInput
                  {...control}
                  name="password"
                  autoComplete="current-password"
                  placeholder="Your password"
                  value={values.password}
                  onChange={(event) => update("password", event.target.value)}
                  disabled={busy !== null}
                  maxLength={128}
                />
              )}
            </FormField>
            <p className="mt-2 text-right">
              <Link
                href={withNext("/forgot-password", next)}
                className="text-moss-deep text-[13px] font-medium hover:underline"
              >
                Forgot your password?
              </Link>
            </p>
          </div>
        </div>

        <Button
          type="submit"
          size="lg"
          className="mt-5 w-full"
          loading={busy === "password"}
          disabled={busy === "google"}
        >
          {busy === "password" ? "Signing you in…" : "Sign in"}
        </Button>
      </form>

      <GoogleOption
        enabled={google}
        busy={busy === "google"}
        disabled={busy === "password"}
        onClick={continueWithGoogle}
      />
    </AuthCard>
  );
}
