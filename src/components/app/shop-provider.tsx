"use client";

import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { RenderedAtContext } from "@/lib/client/now";
import { ShopSeedContext, useShop, type ShopSeed } from "@/lib/client/shop-context";
import { CurrencyProvider } from "../ui/money";

/**
 * Everything inside a shop reads from here: the shop, the person's role, their other shops and
 * their account, as the server layout read them. Amounts default to the shop's currency, and
 * the first render's clock is the server's, so relative times hydrate as they were written.
 */
export function ShopProvider({
  seed,
  renderedAt,
  children,
}: {
  seed: ShopSeed;
  renderedAt: number;
  children: ReactNode;
}) {
  return (
    // A key that changes (another case, another shop) must never show the old key's data.
    <SWRConfig value={{ keepPreviousData: false }}>
      <RenderedAtContext.Provider value={renderedAt}>
        <ShopSeedContext.Provider value={seed}>
          <ShopCurrency>{children}</ShopCurrency>
        </ShopSeedContext.Provider>
      </RenderedAtContext.Provider>
    </SWRConfig>
  );
}

function ShopCurrency({ children }: { children: ReactNode }) {
  const { currency } = useShop();
  return <CurrencyProvider currency={currency}>{children}</CurrencyProvider>;
}
