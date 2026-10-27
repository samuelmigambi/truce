"use client";

import { motion } from "motion/react";
import { Check, Pencil } from "lucide-react";
import { duration, ease, spring } from "../motion";

/** A still of the case file's draft and its sentence-by-sentence check, for the landing page. */

const SENTENCES = [
  {
    text: "Hi Priya, thank you for the photo, and sorry the pillar felt smaller than you expected.",
    evidence: ["E5"],
  },
  {
    text: "The listing gives its size as 3 in wide by 4 in tall, and the candle in your photo matches it.",
    evidence: ["E3", "E5"],
  },
  {
    text: "We'd still like you to be happy with it, so we can refund $10 and you keep the candle.",
    evidence: ["E4"],
  },
];

export function VerifyMock() {
  return (
    <div className="border-line bg-paper rounded-[18px] border p-5 shadow-[0_30px_70px_-34px_rgb(30_38_20/0.28)] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-ink text-sm font-semibold">Offer to Priya Shah</p>
          <p className="text-ink-2 text-xs">Settle: a $10 partial refund, no dispute fee</p>
        </div>
        <span className="border-line text-ink-2 inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium">
          <Pencil className="size-3" />
          Edit
        </span>
      </div>
      <ul className="mt-4 space-y-2">
        {SENTENCES.map((s, i) => (
          <motion.li
            key={s.text}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: duration.base, ease: ease.out, delay: 0.1 + i * 0.18 }}
            className="bg-cream flex gap-3 rounded-[12px] px-3.5 py-3"
          >
            <motion.span
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ ...spring.pop, delay: 0.45 + i * 0.18 }}
              className="bg-lemon mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full"
            >
              <Check className="text-ink size-3" strokeWidth={3} />
            </motion.span>
            <div className="min-w-0">
              <p className="text-ink text-[13px] leading-relaxed">{s.text}</p>
              <p className="mt-1.5 flex gap-1">
                {s.evidence.map((e) => (
                  <span
                    key={e}
                    className="bg-mist text-moss-deep inline-flex h-[18px] items-center rounded-[5px] px-1 text-[10px] font-semibold tabular-nums"
                  >
                    {e}
                  </span>
                ))}
              </p>
            </div>
          </motion.li>
        ))}
      </ul>
      <div className="border-line-soft mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-moss-deep text-xs">3 of 3 sentences supported by the evidence</p>
        <span className="rounded-btn bg-ink text-cream inline-flex h-9 items-center px-3.5 text-sm font-medium">
          Approve and send
        </span>
      </div>
    </div>
  );
}
