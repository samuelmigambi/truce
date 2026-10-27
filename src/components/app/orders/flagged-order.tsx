"use client";

import { motion } from "motion/react";
import { Check, Copy, MessagesSquare, ShieldAlert } from "lucide-react";
import { useState } from "react";
import type { OrderWithChecks } from "@/lib/api-types";
import type { Address } from "@/lib/domain";
import { openAsk } from "@/lib/client/ask";
import { POLICIES } from "@/lib/catalog";
import { duration, ease } from "../../motion";
import { Button } from "../../ui/button";

function oneLine(a: Address | null): string {
  if (!a) return "None on file";
  return [a.line1, a.line2, `${a.city}, ${a.state} ${a.postalCode}`].filter(Boolean).join(", ");
}

/**
 * The note to the buyer, from the shop's own shipping policy: Wick & Ember ships only to the
 * address on the PayPal payment. Plain words, no model needed.
 */
export function noteFor(order: OrderWithChecks, shopName: string): string {
  const first = order.buyer.name.split(/\s+/)[0] ?? order.buyer.name;
  const asked = order.shipTo
    ? `${order.shipTo.line1}, ${order.shipTo.city}`
    : "a different address";
  return [
    `Hi ${first}, thanks for your order ${order.id}.`,
    `Your note asks us to ship to ${asked}, but we can only ship to the address on your PayPal payment, which keeps the order protected for both of us.`,
    "If you'd like it to go there, please update the shipping address in PayPal and reply to this email. We'll ship as soon as it matches.",
    `Thanks, ${shopName}`,
  ].join("\n\n");
}

/** An order that would ship without Seller Protection, the reason, and a note ready to send. */
export function FlaggedOrder({
  order,
  shopName,
  index = 0,
}: {
  order: OrderWithChecks;
  shopName: string;
  index?: number;
}) {
  const [copied, setCopied] = useState(false);
  const failed = order.checks.checks.filter((c) => !c.ok);
  const note = noteFor(order, shopName);

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
          <p className="text-ink-2 text-xs leading-relaxed">
            Your policy: &ldquo;{POLICIES.shipping[1]}&rdquo;
          </p>
        </div>

        <div className="border-line bg-cream/40 flex flex-col rounded-[10px] border">
          <div className="border-line-soft flex items-center justify-between gap-3 border-b px-4 py-2.5">
            <p className="text-ink text-[13px] font-medium">
              Note to {order.buyer.name.split(/\s+/)[0]}
            </p>
            <span className="text-ink-3 text-[11px]">From your shipping policy</span>
          </div>
          <p className="text-ink flex-1 px-4 py-3 text-[13.5px] leading-relaxed whitespace-pre-line">
            {note}
          </p>
          <div className="border-line-soft flex flex-wrap items-center justify-end gap-2 border-t px-4 py-2.5">
            <Button
              size="sm"
              variant="ghost"
              icon={<MessagesSquare />}
              onClick={() =>
                openAsk(
                  `Reword the note to the buyer of ${order.id} about their shipping address, keeping it short and kind.`,
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
            >
              {copied ? "Copied" : "Copy note"}
            </Button>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
