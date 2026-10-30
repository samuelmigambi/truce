import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { firstParam } from "@/components/auth/next-path";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import type { ShopSummary } from "@/lib/api-types";
import { landingFor, onboardingState, requirePageUser } from "@/server/auth/pages";

export const metadata: Metadata = {
  title: "Set up Truce",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Onboarding. It resumes the shop being set up (or the one named by `?shop=`), and `?new=1`
 * starts another shop for someone who has one already. A person whose shop is ready, and who
 * isn't adding another, belongs in the app instead.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const adding = firstParam(params.new) === "1";
  const shopId = firstParam(params.shop) || undefined;

  const back = new URLSearchParams();
  if (adding) back.set("new", "1");
  if (shopId) back.set("shop", shopId);
  const query = back.toString();
  const user = await requirePageUser(`/onboarding${query ? `?${query}` : ""}`);

  const state = await onboardingState(user, { shopId });
  if (!state.shop && !adding && state.shops.some((s: ShopSummary) => s.status === "ready")) {
    redirect(landingFor(state.user, state.shops));
  }

  // Adding a shop starts from a blank one, unless the address names a draft to resume.
  const shop = adding && !shopId ? null : state.shop;

  return (
    <OnboardingFlow key={shop?.id ?? "new"} user={state.user} shop={shop} shops={state.shops} />
  );
}
