import type { Metadata } from "next";
import { requirePageUser } from "@/server/auth/pages";

export const metadata: Metadata = {
  title: { default: "Cases", template: "%s · Truce" },
  robots: { index: false },
};

/** Every app page needs a signed-in person; the shop's own layout then checks the shop. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser("/app");
  return children;
}
