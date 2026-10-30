"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { safeNext, signInWithGoogle, signUp } from "@/lib/client/auth";
import { emailSchema, passwordSchema, personNameSchema } from "@/lib/validation";
import { Button } from "../ui/button";
import { Input } from "../ui/field";
import { FormField } from "../ui/form-field";
import { PasswordInput } from "../ui/password-input";
import { useToast } from "../ui/toast";
import { AuthCard } from "./auth-shell";
import { asFailure, focusField, GoogleOption, useAuthPage } from "./auth-parts";
import { withNext } from "./next-path";

type FieldKey = "name" | "email" | "password";

const FIELDS: readonly FieldKey[] = ["name", "email", "password"];
const ID: Record<FieldKey, string> = {
  name: "signup-name",
  email: "signup-email",
  password: "signup-password",
};

/** Firebase codes that are about one field, so the message shows under that field. */
const FIELD_FOR_CODE: Record<string, FieldKey> = {
  "auth/invalid-email": "email",
  "auth/missing-email": "email",
  "auth/weak-password": "password",
  "auth/missing-password": "password",
};

function check(values: Record<FieldKey, string>): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  const name = personNameSchema.safeParse(values.name);
  if (!name.success) errors.name = name.error.issues[0]?.message;
  const email = emailSchema.safeParse(values.email);
  if (!email.success) errors.email = email.error.issues[0]?.message;
  const password = passwordSchema.safeParse(values.password);
  if (!password.success) errors.password = password.error.issues[0]?.message;
  return errors;
}

/** Creating an account: a name, an email and a password, or Google when it's on. */
export function SignUpForm({ next }: { next: string | null }) {
  const { google } = useAuthPage();
  const [values, setValues] = useState<Record<FieldKey, string>>({
    name: "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const toast = useToast();
  const [busy, setBusy] = useState<"password" | "google" | null>(null);

  function update(key: FieldKey, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  }

  /** Shows why it failed: under the field it's about, or in a toast. */
  function failed(error: unknown) {
    const problem = asFailure(error);
    const field = FIELD_FOR_CODE[problem.code];
    const taken = problem.code === "auth/email-already-in-use";
    // The fields are enabled again before focus moves into one.
    flushSync(() => {
      setBusy(null);
      if (field) setErrors({ [field]: problem.message });
    });
    if (!field) {
      toast({
        key: "signup",
        tone: "error",
        title: taken ? "There's already an account with that email." : problem.message,
        action: taken ? { label: "Sign in instead", href: withNext("/signin", next) } : undefined,
      });
    }
    if (field) focusField(ID[field]);
    else if (taken) focusField(ID.email, true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const found = check(values);
    setErrors(found);
    const first = FIELDS.find((key) => found[key]);
    if (first) {
      focusField(ID[first]);
      return;
    }
    setBusy("password");
    try {
      const session = await signUp(values);
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
      title="Create your account"
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={withNext("/signin", next)}
            className="text-moss-deep font-medium hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form method="post" noValidate onSubmit={submit} aria-label="Create your account">
        <div className="space-y-4">
          <FormField id={ID.name} label="Your name" error={errors.name}>
            {(control) => (
              <Input
                {...control}
                name="name"
                autoComplete="name"
                placeholder="Jane Cooper"
                value={values.name}
                onChange={(event) => update("name", event.target.value)}
                disabled={busy !== null}
                maxLength={60}
              />
            )}
          </FormField>
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
          <FormField id={ID.password} label="Password" error={errors.password}>
            {(control) => (
              <PasswordInput
                {...control}
                name="password"
                autoComplete="new-password"
                placeholder="8 or more characters"
                value={values.password}
                onChange={(event) => update("password", event.target.value)}
                disabled={busy !== null}
                maxLength={128}
              />
            )}
          </FormField>
        </div>

        <Button
          type="submit"
          size="lg"
          className="mt-6 w-full"
          loading={busy === "password"}
          disabled={busy === "google"}
        >
          {busy === "password" ? "Creating your account…" : "Create account"}
        </Button>
      </form>

      <GoogleOption
        enabled={google}
        busy={busy === "google"}
        disabled={busy === "password"}
        onClick={continueWithGoogle}
      />

      <p className="text-ink-3 mt-5 text-center text-xs leading-relaxed text-pretty">
        By creating an account, you agree to Truce&rsquo;s{" "}
        <Link href="/terms" className="text-ink-2 hover:text-ink underline underline-offset-2">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-ink-2 hover:text-ink underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </p>
    </AuthCard>
  );
}
