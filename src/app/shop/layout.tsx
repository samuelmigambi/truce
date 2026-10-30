import type { Metadata } from "next";
import { Figtree, Fraunces } from "next/font/google";
import Link from "next/link";
import { FontScope } from "@/components/shop/font-scope";
import { LightOnly } from "@/components/shop/light-only";
import { ShopHeader } from "@/components/shop/shop-header";
import { Wordmark } from "@/components/shop/ui";
import { SHOP } from "@/lib/catalog";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz", "SOFT"],
});
const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-figtree",
});

export const metadata: Metadata = {
  title: { default: "Wick & Ember: small-batch candles", template: "%s · Wick & Ember" },
  description: SHOP.tagline,
  icons: { icon: [{ url: "/shop/icon.svg", type: "image/svg+xml" }] },
};

/** Wick & Ember, the demo storefront: its own warm look, fonts and voice. */
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${fraunces.variable} ${figtree.variable} bg-linen font-shop text-espresso flex min-h-dvh flex-col`}
    >
      <FontScope classes={`${fraunces.variable} ${figtree.variable}`} />
      <LightOnly />
      <ShopHeader />
      <main className="flex-1">{children}</main>
      <footer className="border-hairline mt-24 border-t">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-12 sm:grid-cols-[1.5fr_1fr_1fr] sm:px-8">
          <div>
            <Wordmark />
            <p className="text-espresso-2 mt-4 max-w-xs text-[15px] leading-relaxed">
              {SHOP.tagline}
            </p>
            <p className="text-espresso-2 mt-3 text-sm">
              {SHOP.address.line1}, {SHOP.address.city}, {SHOP.address.state}{" "}
              {SHOP.address.postalCode}
            </p>
          </div>
          <div>
            <h2 className="text-espresso font-serif text-lg">Help</h2>
            <ul className="text-espresso-2 mt-3 space-y-2 text-[15px]">
              <li>
                <Link className="hover:text-espresso" href="/shop/policies">
                  Shipping and returns
                </Link>
              </li>
              <li>
                <span>{SHOP.email}</span>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-espresso font-serif text-lg">A demo storefront</h2>
            <p className="text-espresso-2 mt-3 text-[15px] leading-relaxed">
              Wick &amp; Ember is made up. Orders go through PayPal&rsquo;s sandbox and show up in
              the{" "}
              <Link href="/app" className="text-ember underline-offset-4 hover:underline">
                Truce
              </Link>{" "}
              shops connected to this sandbox app.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
