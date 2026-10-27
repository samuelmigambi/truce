import { ChevronRight, RotateCcw, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCart } from "@/components/shop/add-to-cart";
import { ProductArt } from "@/components/shop/product-art";
import { ProductCard } from "@/components/shop/product-card";
import { SizeGuide } from "@/components/shop/size-guide";
import { POLICIES, PRODUCTS, productBySlug } from "@/lib/catalog";
import { formatUsd } from "@/lib/money";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const product = productBySlug((await params).slug);
  return product ? { title: product.name, description: product.blurb } : { title: "Not found" };
}

/**
 * A product page. The size is stated plainly near the top: it's what buyers check, and what
 * Truce cites when a buyer says an item was smaller than expected.
 */
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const product = productBySlug((await params).slug);
  if (!product) notFound();
  const size = product.details.find((d) => /size|includes/i.test(d.label));
  const others = PRODUCTS.filter((p) => p.id !== product.id).slice(0, 4);

  return (
    <div className="mx-auto max-w-[1200px] px-5 pt-8 sm:px-8 lg:pt-10">
      <nav aria-label="Breadcrumb" className="text-espresso-2 flex items-center gap-1.5 text-sm">
        <Link href="/shop" className="hover:text-espresso">
          Shop
        </Link>
        <ChevronRight className="text-espresso-3 size-3.5" />
        <span className="text-espresso">{product.name}</span>
      </nav>

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-[14px]">
            <ProductArt product={product} title={`${product.name}, a close-up`} />
          </div>
        </div>

        <div className="lg:pt-2">
          <h1 className="text-espresso font-serif text-[38px] leading-[1.08] tracking-[-0.015em] sm:text-[46px]">
            {product.name}
          </h1>
          <p className="text-espresso mt-3 text-[22px] tabular-nums">{formatUsd(product.price)}</p>
          <p className="text-espresso-2 mt-5 text-[17px] leading-relaxed">{product.description}</p>

          {size && (
            <div className="border-ember/25 mt-6 rounded-[10px] border bg-[#FBF1EA] px-4 py-3.5">
              <p className="text-ember text-[13px] font-medium">{size.label}</p>
              <p className="text-espresso mt-0.5 text-[17px]">{size.value}</p>
            </div>
          )}

          {product.scentNotes.length > 0 && (
            <div className="mt-6">
              <h2 className="text-espresso text-sm font-medium">Scent notes</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {product.scentNotes.map((note) => (
                  <li
                    key={note}
                    className="border-hairline bg-parchment text-espresso-2 rounded-full border px-3 py-1 text-sm"
                  >
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8">
            <AddToCart product={product} />
            <p className="text-espresso-2 mt-3 text-[13px]">
              {product.stock > 10 ? "In stock" : `Only ${product.stock} left`}. Pay with PayPal at
              checkout.
            </p>
          </div>

          <dl className="divide-hairline-soft border-hairline mt-10 divide-y border-y">
            {product.details.map((d) => (
              <div key={d.label} className="grid grid-cols-[120px_1fr] gap-4 py-3.5 text-[15px]">
                <dt className="text-espresso-2">{d.label}</dt>
                <dd className="text-espresso">{d.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-8">
            <SizeGuide product={product} />
          </div>

          <ul className="text-espresso-2 mt-8 space-y-4 text-[15px]">
            <li className="flex gap-3">
              <Truck className="text-ember mt-0.5 size-5 shrink-0" />
              <span>{POLICIES.shipping[0]}</span>
            </li>
            <li className="flex gap-3">
              <RotateCcw className="text-ember mt-0.5 size-5 shrink-0" />
              <span>
                {POLICIES.returns[0]}{" "}
                <Link
                  href="/shop/policies"
                  className="text-ember underline-offset-4 hover:underline"
                >
                  Shipping and returns
                </Link>
              </span>
            </li>
          </ul>
        </div>
      </div>

      <section className="mt-24">
        <h2 className="text-espresso font-serif text-[28px]">You might also like</h2>
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
          {others.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
