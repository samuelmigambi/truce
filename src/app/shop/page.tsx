import { Flame, Leaf, Truck } from "lucide-react";
import type { Metadata } from "next";
import { ProductArt } from "@/components/shop/product-art";
import { ProductCard } from "@/components/shop/product-card";
import { ShopLink } from "@/components/shop/ui";
import { PRODUCTS, productBySlug } from "@/lib/catalog";

export const metadata: Metadata = { title: { absolute: "Wick & Ember: small-batch candles" } };

export default function ShopHome() {
  const hero = productBySlug("amber-glow-pillar") ?? PRODUCTS[0]!;
  const side = productBySlug("ember-mug-candle") ?? PRODUCTS[1]!;

  return (
    <>
      <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 pt-12 pb-16 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:pt-16">
        <div>
          <p className="text-ember text-[15px]">Poured by hand in Portland, Oregon</p>
          <h1 className="text-espresso mt-4 font-serif text-[44px] leading-[1.02] font-normal tracking-[-0.02em] sm:text-[60px]">
            Small-batch candles for long evenings
          </h1>
          <p className="text-espresso-2 mt-6 max-w-[460px] text-[17px] leading-relaxed">
            Coconut, soy and beeswax blends, cotton wicks, and scents built around a place or a
            season. Every order ships in 1–2 business days.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ShopLink href="#collection" size="lg" className="max-sm:w-full">
              Shop the collection
            </ShopLink>
            <ShopLink href="/shop/policies" size="lg" variant="secondary" className="max-sm:w-full">
              Shipping and returns
            </ShopLink>
          </div>
        </div>
        <div className="grid grid-cols-2 items-start gap-4 sm:gap-5">
          <div className="overflow-hidden rounded-[14px]">
            <ProductArt product={hero} />
          </div>
          <div className="mt-12 overflow-hidden rounded-[14px] sm:mt-16">
            <ProductArt product={side} />
          </div>
        </div>
      </section>

      <section aria-label="How we make them" className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <ul className="border-hairline bg-hairline grid gap-px overflow-hidden rounded-[10px] border sm:grid-cols-3">
          {[
            {
              icon: <Flame />,
              title: "Poured in small batches",
              body: "A few dozen at a time, so every candle gets looked at.",
            },
            {
              icon: <Leaf />,
              title: "Clean-burning wax",
              body: "Coconut, soy and beeswax blends with lead-free cotton wicks.",
            },
            {
              icon: <Truck />,
              title: "Tracked from Portland",
              body: "USPS Ground Advantage, with tracking added to your PayPal order.",
            },
          ].map((item) => (
            <li key={item.title} className="bg-parchment flex gap-4 p-6">
              <span className="text-ember mt-0.5 [&_svg]:size-5">{item.icon}</span>
              <div>
                <h2 className="text-espresso font-serif text-lg">{item.title}</h2>
                <p className="text-espresso-2 mt-1 text-sm leading-relaxed">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section id="collection" className="mx-auto max-w-[1200px] scroll-mt-24 px-5 pt-20 sm:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-espresso font-serif text-[34px] leading-tight tracking-[-0.01em]">
              The collection
            </h2>
            <p className="text-espresso-2 mt-1.5 text-[15px]">
              Seven candles we pour ourselves, and the brass trimmer we use on every one.
            </p>
          </div>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
          {PRODUCTS.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </>
  );
}
