"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { openCart, priceCart, useCart } from "@/lib/client/cart";
import { spring } from "../motion";
import { cn } from "../ui/cn";
import { CartDrawer } from "./cart-drawer";
import { Wordmark } from "./ui";

/** The slim notice that this is a demo storefront on the sandbox, then the header with its bag. */
export function ShopHeader() {
  const count = priceCart(useCart()).count;
  const pathname = usePathname();
  const links = [
    {
      href: "/shop",
      label: "Shop",
      active: pathname === "/shop" || pathname.startsWith("/shop/products"),
    },
    { href: "/shop/policies", label: "Shipping & returns", active: pathname === "/shop/policies" },
  ];

  return (
    <>
      <div className="bg-espresso text-linen">
        <div className="mx-auto flex max-w-[1200px] items-center justify-center gap-3 px-5 py-2 text-center text-[13px] sm:px-8">
          <p className="text-linen/85">
            Demo storefront on PayPal&rsquo;s sandbox. No real money moves.
          </p>
          <Link
            href="/app"
            className="text-linen inline-flex shrink-0 items-center gap-0.5 font-medium underline-offset-4 hover:underline max-sm:hidden"
          >
            Open Truce
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </div>
      <header className="border-hairline bg-linen/90 sticky top-0 z-30 border-b backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-[1200px] items-center justify-between gap-6 px-5 sm:px-8">
          <Link href="/shop" aria-label="Wick & Ember home" className="rounded-md">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <nav aria-label="Shop" className="flex items-center gap-1 max-sm:hidden">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={l.active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-2 text-[15px] transition-colors",
                    l.active ? "text-espresso" : "text-espresso-2 hover:text-espresso",
                  )}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            <button
              type="button"
              onClick={openCart}
              aria-label={
                count ? `Your bag, ${count} ${count === 1 ? "item" : "items"}` : "Your bag"
              }
              className="text-espresso hover:bg-linen-deep relative flex h-10 items-center gap-2 rounded-[6px] px-3 text-[15px] transition-colors"
            >
              <ShoppingBag className="size-5" />
              <span className="max-sm:hidden">Bag</span>
              <AnimatePresence>
                {count > 0 && (
                  <motion.span
                    key={count}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={spring.pop}
                    className="bg-ember text-linen flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
                  >
                    {count}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>
      </header>
      <CartDrawer />
    </>
  );
}
