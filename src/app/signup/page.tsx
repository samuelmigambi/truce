import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { firstParam, safeNextPath } from "@/components/auth/next-path";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { landingFor, pageShops, pageUser } from "@/server/auth/pages";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Create a Truce account, connect your PayPal, and let Truce handle your disputes. You approve every step.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Creating an account. Someone already signed in goes straight on to their shop or setup. */
export default async function SignUpPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNextPath(firstParam(params.next));
  const user = await pageUser();
  if (user) redirect(next ?? landingFor(user, await pageShops(user)));

  return (
    <AuthShell>
      <SignUpForm next={next} />
    </AuthShell>
  );
}
