import { redirect } from "next/navigation";
import { landingFor, pageShops, requirePageUser } from "@/server/auth/pages";

/** /app opens the shop the person last used, or onboarding when no shop is ready yet. */
export default async function AppHome() {
  const user = await requirePageUser("/app");
  redirect(landingFor(user, await pageShops(user)));
}
