import { AppShell } from "@/components/app/app-shell";
import { ShopProvider } from "@/components/app/shop-provider";
import { shopHref } from "@/lib/client/api";
import { requirePageShop, requirePageUser } from "@/server/auth/pages";

/** When this request was served; the browser's first render reuses it (see useNow). */
function servedAt(): number {
  return Date.now();
}

/**
 * A shop's part of the app. The server checks the person is a member of a ready shop (anyone
 * else gets a plain 404, and a shop still in setup goes back to onboarding), then hands what it
 * read to the browser, so the first screen paints without a request.
 */
export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const user = await requirePageUser(shopHref(shopId));
  const { shop, role, shops } = await requirePageShop(user, shopId);
  return (
    <ShopProvider key={shop.id} seed={{ shop, role, shops, user }} renderedAt={servedAt()}>
      <AppShell>{children}</AppShell>
    </ShopProvider>
  );
}
