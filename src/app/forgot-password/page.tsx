import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { firstParam, safeNextPath } from "@/components/auth/next-path";
import { landingFor, pageShops, pageUser } from "@/server/auth/pages";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Asking for a reset link. Someone already signed in has no need for one, so they go on. */
export default async function ForgotPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNextPath(firstParam(params.next));
  const user = await pageUser();
  if (user) redirect(next ?? landingFor(user, await pageShops(user)));

  return (
    <AuthShell>
      <ForgotPasswordForm next={next} />
    </AuthShell>
  );
}
