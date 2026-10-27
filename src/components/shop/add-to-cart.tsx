"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { addToCart, openCart } from "@/lib/client/cart";
import type { Product } from "@/lib/catalog";
import { formatUsd } from "@/lib/money";
import { spring } from "../motion";
import { Quantity } from "./quantity";
import { ShopButton } from "./ui";

/** Quantity and "Add to bag", which opens the bag so the buyer sees it land. */
export function AddToCart({ product }: { product: Product }) {
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 1800);
    return () => window.clearTimeout(timer);
  }, [added]);

  return (
    <div className="flex gap-3">
      <Quantity label="Quantity" value={quantity} onChange={setQuantity} />
      <ShopButton
        className="relative flex-1 overflow-hidden"
        onClick={() => {
          addToCart(product.id, quantity);
          setAdded(true);
          window.setTimeout(openCart, 380);
        }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {added ? (
            <motion.span
              key="added"
              className="flex items-center gap-2"
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1, transition: spring.pop }}
              exit={{ y: -14, opacity: 0 }}
            >
              <Check className="size-4" strokeWidth={2.5} />
              Added to your bag
            </motion.span>
          ) : (
            <motion.span
              key="add"
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -14, opacity: 0 }}
            >
              Add to bag · {formatUsd(product.price * quantity)}
            </motion.span>
          )}
        </AnimatePresence>
      </ShopButton>
    </div>
  );
}
