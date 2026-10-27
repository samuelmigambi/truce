"use client";

import { AnimatePresence, motion } from "motion/react";
import { ShoppingBag, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  closeCart,
  priceCart,
  removeFromCart,
  setQuantity,
  useCart,
  useCartOpen,
} from "@/lib/client/cart";
import { formatUsd } from "@/lib/money";
import { spring } from "../motion";
import { Sheet } from "../ui/overlay";
import { ProductArt } from "./product-art";
import { Quantity } from "./quantity";
import { ShopButton } from "./ui";

/** The bag: what's in it, quantities, and the way to checkout. */
export function CartDrawer() {
  const open = useCartOpen();
  const cart = priceCart(useCart());
  const router = useRouter();

  return (
    <Sheet
      open={open}
      onClose={closeCart}
      title="Your bag"
      surface="bg-parchment border-hairline text-espresso font-shop"
    >
      {cart.lines.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <span className="bg-linen text-espresso-2 flex size-12 items-center justify-center rounded-full">
            <ShoppingBag className="size-5" />
          </span>
          <p className="text-espresso mt-4 font-serif text-xl">Your bag is empty</p>
          <p className="text-espresso-2 mt-1.5 text-sm">
            Find something that smells like a good evening.
          </p>
          <ShopButton variant="secondary" className="mt-6" onClick={closeCart}>
            Keep browsing
          </ShopButton>
        </div>
      ) : (
        <>
          <ul className="divide-hairline-soft flex-1 divide-y overflow-y-auto px-5">
            <AnimatePresence initial={false}>
              {cart.lines.map((line) => (
                <motion.li
                  key={line.productId}
                  layout
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24, transition: { duration: 0.16 } }}
                  transition={spring.layout}
                  className="flex gap-4 py-4"
                >
                  <Link
                    href={`/shop/products/${line.product.slug}`}
                    onClick={closeCart}
                    className="w-20 shrink-0 overflow-hidden rounded-[6px]"
                  >
                    <ProductArt product={line.product} lit={false} />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-espresso font-serif text-[17px] leading-snug">
                        {line.product.name}
                      </p>
                      <button
                        type="button"
                        aria-label={`Remove ${line.product.name}`}
                        onClick={() => removeFromCart(line.productId)}
                        className="text-espresso-3 hover:bg-linen hover:text-espresso -mt-0.5 -mr-1 flex size-7 shrink-0 items-center justify-center rounded-md transition-colors [&_svg]:size-4"
                      >
                        <X />
                      </button>
                    </div>
                    <p className="text-espresso-2 text-[13px]">
                      {formatUsd(line.product.price)} each
                    </p>
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <Quantity
                        size="sm"
                        label={`Quantity of ${line.product.name}`}
                        value={line.quantity}
                        onChange={(q) => setQuantity(line.productId, q)}
                      />
                      <p className="text-espresso font-medium tabular-nums">
                        {formatUsd(line.total)}
                      </p>
                    </div>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <div className="border-hairline border-t px-5 pt-4 pb-5">
            <div className="flex items-baseline justify-between">
              <span className="text-espresso-2 text-[15px]">Subtotal</span>
              <span className="text-espresso text-lg font-semibold tabular-nums">
                {formatUsd(cart.subtotal)}
              </span>
            </div>
            <p className="text-espresso-2 mt-1 text-[13px]">
              Paid with PayPal. We ship to the address on your payment.
            </p>
            <ShopButton
              size="lg"
              className="mt-4 w-full"
              onClick={() => {
                closeCart();
                router.push("/shop/checkout");
              }}
            >
              Checkout
            </ShopButton>
          </div>
        </>
      )}
    </Sheet>
  );
}
