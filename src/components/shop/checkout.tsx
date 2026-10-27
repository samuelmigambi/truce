"use client";

import {
  PayPalButtons,
  PayPalScriptProvider,
  usePayPalScriptReducer,
} from "@paypal/react-paypal-js";
import { AnimatePresence, motion } from "motion/react";
import { CircleAlert, LockKeyhole, ShoppingBag, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { errorMessage } from "@/lib/client/api";
import {
  clearCart,
  priceCart,
  removeFromCart,
  setQuantity,
  useCart,
  type CartLine,
} from "@/lib/client/cart";
import { captureShopOrder, createShopOrder, type ShopConfig } from "@/lib/client/shop";
import { formatUsd } from "@/lib/money";
import { spring } from "../motion";
import { Spinner } from "../ui/spinner";
import { ProductArt } from "./product-art";
import { Quantity } from "./quantity";
import { ShopLink } from "./ui";

/** The checkout: the bag on the left, PayPal on the right. */
export function Checkout() {
  const lines = useCart();
  const cart = priceCart(lines);
  const [paying, setPaying] = useState(false);

  if (cart.lines.length === 0 && !paying) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-5 py-24 text-center">
        <span className="bg-parchment text-espresso-2 ring-hairline flex size-14 items-center justify-center rounded-full ring-1">
          <ShoppingBag className="size-6" />
        </span>
        <h1 className="text-espresso mt-5 font-serif text-3xl">Your bag is empty</h1>
        <p className="text-espresso-2 mt-2">
          Add a candle or two, then come back here to pay with PayPal.
        </p>
        <ShopLink href="/shop" className="mt-7">
          Browse the collection
        </ShopLink>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-[1100px] gap-10 px-5 pt-10 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:gap-14 lg:pt-14">
      <section aria-labelledby="bag-title">
        <h1
          id="bag-title"
          className="text-espresso font-serif text-[40px] leading-tight tracking-[-0.015em]"
        >
          Checkout
        </h1>
        <ul className="divide-hairline-soft border-hairline mt-8 divide-y border-y">
          <AnimatePresence initial={false}>
            {cart.lines.map((line) => (
              <motion.li
                key={line.productId}
                layout
                exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
                transition={spring.layout}
                className="flex gap-4 overflow-hidden py-5"
              >
                <div className="w-20 shrink-0 overflow-hidden rounded-[8px] sm:w-24">
                  <ProductArt product={line.product} lit={false} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/shop/products/${line.product.slug}`}
                        className="text-espresso font-serif text-lg hover:underline"
                      >
                        {line.product.name}
                      </Link>
                      <p className="text-espresso-2 text-sm">
                        {formatUsd(line.product.price)} each
                      </p>
                    </div>
                    <p className="text-espresso font-medium tabular-nums">
                      {formatUsd(line.total)}
                    </p>
                  </div>
                  <div className="mt-auto flex items-center gap-3 pt-3">
                    <Quantity
                      size="sm"
                      label={`Quantity of ${line.product.name}`}
                      value={line.quantity}
                      onChange={(q) => setQuantity(line.productId, q)}
                    />
                    <button
                      type="button"
                      onClick={() => removeFromCart(line.productId)}
                      className="text-espresso-2 hover:text-espresso inline-flex items-center gap-1 text-sm transition-colors [&_svg]:size-3.5"
                    >
                      <X />
                      Remove
                    </button>
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <dl className="mt-6 space-y-2 text-[15px]">
          <div className="text-espresso-2 flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatUsd(cart.subtotal)}</dd>
          </div>
          <div className="border-hairline text-espresso flex justify-between border-t pt-3 text-lg font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatUsd(cart.subtotal)}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="pay-title" className="lg:pt-[72px]">
        <div className="border-hairline bg-parchment rounded-[14px] border p-6 sm:p-7 lg:sticky lg:top-28">
          <h2 id="pay-title" className="text-espresso font-serif text-2xl">
            Pay with PayPal
          </h2>
          <p className="text-espresso-2 mt-2 text-[15px] leading-relaxed">
            We ship to the address on your PayPal payment, so check it there before you pay.
          </p>
          <div className="mt-6">
            <PayPalPanel lines={lines} onPaying={setPaying} />
          </div>
          <p className="border-hairline-soft text-espresso-2 mt-5 flex items-start gap-2 border-t pt-4 text-[13px] leading-relaxed">
            <LockKeyhole className="mt-0.5 size-3.5 shrink-0" />
            <span>
              This is PayPal&rsquo;s sandbox: sign in with a sandbox buyer account. No real money
              moves.{" "}
              <Link href="/shop/policies" className="text-ember underline-offset-4 hover:underline">
                Shipping and returns
              </Link>
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}

function PayPalPanel({
  lines,
  onPaying,
}: {
  lines: CartLine[];
  onPaying: (paying: boolean) => void;
}) {
  const { data, error, isLoading } = useSWR<ShopConfig>("/api/shop/config");

  if (isLoading) return <ButtonsSkeleton />;
  if (error) return <Notice>{errorMessage(error)}</Notice>;
  if (!data?.clientId)
    return (
      <Notice>PayPal isn&rsquo;t connected on this server, so checkout is off for now.</Notice>
    );

  return (
    <PayPalScriptProvider
      options={{
        clientId: data.clientId,
        currency: "USD",
        intent: "capture",
        components: "buttons",
        disableFunding: "card,credit,paylater,venmo",
      }}
    >
      <Buttons lines={lines} onPaying={onPaying} />
    </PayPalScriptProvider>
  );
}

function Buttons({ lines, onPaying }: { lines: CartLine[]; onPaying: (paying: boolean) => void }) {
  const [{ isPending, isRejected }] = usePayPalScriptReducer();
  const [problem, setProblem] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const router = useRouter();

  if (isRejected)
    return <Notice>PayPal didn&rsquo;t load. Check your connection and refresh the page.</Notice>;

  return (
    <div className="relative">
      {isPending ? (
        <ButtonsSkeleton />
      ) : (
        <PayPalButtons
          style={{
            layout: "vertical",
            color: "gold",
            shape: "rect",
            label: "pay",
            height: 48,
            tagline: false,
          }}
          forceReRender={[lines.map((l) => `${l.productId}:${l.quantity}`).join(",")]}
          createOrder={async () => {
            setProblem(null);
            try {
              return await createShopOrder(lines);
            } catch (error) {
              setProblem(errorMessage(error));
              throw error;
            }
          }}
          onApprove={async (data) => {
            setCapturing(true);
            onPaying(true);
            try {
              const orderId = await captureShopOrder(data.orderID);
              clearCart();
              const query = new URLSearchParams({ paypal: data.orderID });
              if (orderId) query.set("order", orderId);
              router.push(`/shop/thanks?${query.toString()}`);
            } catch (error) {
              setCapturing(false);
              onPaying(false);
              setProblem(errorMessage(error));
            }
          }}
          onCancel={() => setProblem("You closed PayPal before paying. Your bag is still here.")}
          onError={() => setProblem("PayPal couldn't finish the payment. Try again in a moment.")}
        />
      )}
      <AnimatePresence>
        {problem && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Notice>{problem}</Notice>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {capturing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-parchment/90 text-espresso absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-[8px] text-[15px]"
          >
            <Spinner />
            Confirming your payment
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ButtonsSkeleton() {
  return (
    <div aria-hidden className="space-y-3">
      <div className="shimmer h-12 rounded-[6px] bg-[#F3D27A]/50" />
      <div className="bg-espresso/10 mx-auto h-3 w-40 rounded" />
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="text-ember-deep mt-3 flex items-start gap-2 rounded-[8px] bg-[#FBEDE6] px-3.5 py-3 text-sm leading-relaxed"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
