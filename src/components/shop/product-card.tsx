import Link from "next/link";
import type { Product } from "@/lib/catalog";
import { formatUsd } from "@/lib/money";
import { ProductArt } from "./product-art";

/** A product in the grid: the drawn photo, the name, one line, the price. */
export function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/shop/products/${product.slug}`}
      className="group block rounded-[10px] outline-offset-4"
    >
      <div className="bg-linen-deep overflow-hidden rounded-[10px]">
        <ProductArt
          product={product}
          className="transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.035]"
        />
      </div>
      <div className="mt-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-espresso font-serif text-[19px] leading-snug">{product.name}</h3>
          <p className="text-espresso-2 mt-1 line-clamp-2 text-sm leading-relaxed">
            {product.blurb}
          </p>
        </div>
        <p className="text-espresso shrink-0 pt-0.5 text-[15px] font-medium tabular-nums">
          {formatUsd(product.price)}
        </p>
      </div>
    </Link>
  );
}
