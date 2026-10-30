import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { firstParam, safeNextPath } from "@/components/auth/next-path";
import { SignInForm } from "@/components/auth/sign-in-form";
import { landingFor, pageShops, pageUser } from "@/server/auth/pages";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Truce, and pick up your PayPal disputes where you left them.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Signing in. Someone already signed in goes straight on: where they were headed, or their shop. */
export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNextPath(firstParam(params.next));
  const user = await pageUser();
  if (user) redirect(next ?? landingFor(user, await pageShops(user)));

  return (
    <AuthShell>
      <SignInForm next={next} signedOutEverywhere={firstParam(params.signedOut) === "everywhere"} />
    </AuthShell>
  );
}
