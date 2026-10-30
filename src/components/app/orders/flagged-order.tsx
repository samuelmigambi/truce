"use client";

import { motion } from "motion/react";
import { Check, Copy, ShieldAlert } from "lucide-react";
import { useState } from "react";
import type { OrderWithChecks } from "@/lib/api-types";
import type { Address, Shop } from "@/lib/domain";
import { openAsk } from "@/lib/client/ask";
import { useShop } from "@/lib/client/shop-context";
import { POLICIES } from "@/lib/catalog";
import { addressNote } from "@/lib/notes";
import { duration, ease } from "../../motion";
import { Button } from "../../ui/button";

function oneLine(a: Address | null): string {
  if (!a) return "None on file";
  return [a.line1, a.line2, `${a.city}, ${a.state} ${a.postalCode}`].filter(Boolean).join(", ");
}

/**
 * The shipping policy line to quote: the sample shop's own, or the first sentence of a real
 * shop's pasted policy that mentions the address. Null when there's nothing worth quoting.
 */
function policyLine(shop: Pick<Shop, "kind" | "policies">): string | null {
  if (shop.kind === "sample") return POLICIES.shipping[1] ?? null;
  const sentences = shop.policies.shipping.text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const line = sentences.find((s) => /address/i.test(s)) ?? null;
  return line && line.length <= 240 ? line : null;
}

/** An order that would ship without Seller Protection, the reason, and a note ready to send. */
export function FlaggedOrder({ order, index = 0 }: { order: OrderWithChecks; index?: number }) {
  const shop = useShop();
  const [copied, setCopied] = useState(false);
  const failed = order.checks.checks.filter((c) => !c.ok);
  const note = addressNote(order, shop.name);
  const policy = policyLine(shop);

  async function copy() {
    try {
      await navigator.clipboard.writeText(note);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.slow, ease: ease.out, delay: index * 0.06 }}
      aria-label={`${order.id} needs a look before it ships`}
      className="rounded-card border-warn-200 bg-paper overflow-hidden border"
    >
      <div className="bg-warn-50 flex items-start gap-3 px-5 py-4">
        <ShieldAlert className="text-warn-700 mt-0.5 size-5 shrink-0" />
        <div className="min-w-0">
          <h2 className="text-ink text-[15px] font-semibold">
            {order.id} would ship without Seller Protection
          </h2>
          <ul className="text-warn-700 mt-1 space-y-0.5 text-[13.5px]">
            {failed.map((c) => (
              <li key={c.id}>{c.label}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 px-5 py-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          {order.note && (
            <div>
              <p className="text-ink-2 text-xs font-medium">{order.buyer.name} wrote at checkout</p>
              <p className="bg-cream text-ink mt-1.5 rounded-[10px] rounded-tl-[3px] px-3.5 py-2.5 text-[13.5px] leading-relaxed">
                &ldquo;{order.note}&rdquo;
              </p>
            </div>
          )}
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="border-line-soft rounded-[10px] border p-3">
              <dt className="text-ink-2 text-xs font-medium">PayPal address</dt>
              <dd className="text-ink mt-1 text-[13px] leading-relaxed">
                {oneLine(order.paypalAddress)}
              </dd>
            </div>
            <div className="border-warn-200 bg-warn-50/50 rounded-[10px] border p-3">
              <dt className="text-warn-700 text-xs font-medium">The label would go to</dt>
              <dd className="text-ink mt-1 text-[13px] leading-relaxed">{oneLine(order.shipTo)}</dd>
            </div>
          </dl>
          {policy && (
            <p className="text-ink-2 text-xs leading-relaxed">
              Your policy: &ldquo;{policy}&rdquo;
            </p>
          )}
        </div>

        <div className="border-line bg-cream/40 flex flex-col rounded-[10px] border">
          <div className="border-line-soft flex items-center justify-between gap-3 border-b px-4 py-2.5">
            <p className="text-ink text-[13px] font-medium">
              Note to {order.buyer.name.split(/\s+/)[0]}
            </p>
            <span className="text-ink-3 text-[11px]">
              {policy ? "From your shipping policy" : "From Seller Protection's rules"}
            </span>
          </div>
          <p className="text-ink flex-1 px-4 py-3 text-[13.5px] leading-relaxed whitespace-pre-line">
            {note}
          </p>
          <div className="border-line-soft flex flex-wrap items-center justify-end gap-2 border-t px-4 py-2.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                openAsk(
                  shop.id,
                  `Reword the note to ${order.buyer.name} about the shipping address on order ${order.id}, keeping it short and kind.`,
                )
              }
            >
              Reword with Truce
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={copied ? <Check /> : <Copy />}
              onClick={copy}
              aria-live="polite"
            >
              {copied ? "Copied" : "Copy note"}
            </Button>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
