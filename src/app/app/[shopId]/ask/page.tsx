import { redirect } from "next/navigation";
import { shopHref } from "@/lib/client/api";

/** Ask Truce is the shop's home now; the old address goes there. */
export default async function AskIndex({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  redirect(shopHref(shopId));
}
