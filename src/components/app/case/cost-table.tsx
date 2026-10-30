"use client";

import { motion } from "motion/react";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import type { Move } from "@/lib/domain";
import type { MoveCost } from "@/lib/rules/options";
import { MOVE } from "@/lib/client/labels";
import { useMoney } from "@/lib/client/shop-context";
import { duration, ease } from "../../motion";
import { cn } from "../../ui/cn";
import { Tooltip } from "../../ui/tooltip";

/**
 * Fight, settle or refund, side by side: what each would cost, at worst and as expected, and
 * whether it counts toward the shop's claims ratio. Worked out from PayPal's fee rules. The
 * column Truce picked is lit; each move's note is on its name.
 */
export function CostTable({ options, recommended }: { options: MoveCost[]; recommended: Move }) {
  const money = useMoney();
  const max = Math.max(...options.map((o) => o.worst), 1);

  const rows: { label: string; cell: (o: MoveCost, i: number) => ReactNode }[] = [
    {
      label: "Expected loss",
      cell: (o, i) => (
        <>
          <span className={o.move === recommended ? "font-semibold" : undefined}>
            {money(o.expected)}
          </span>
          <span aria-hidden className="bg-ink/[0.06] mt-2 block h-1 w-full max-w-24 rounded-full">
            <motion.span
              className={cn(
                "block h-full origin-left rounded-full",
                o.move === recommended ? "bg-moss" : "bg-ink/30",
              )}
              style={{ width: `${Math.max(4, (o.expected / max) * 100)}%` }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{
                duration: duration.slower + 0.2,
                ease: ease.out,
                delay: 0.15 + i * 0.08,
              }}
            />
          </span>
        </>
      ),
    },
    { label: "Worst case", cell: (o) => money(o.worst) },
    {
      label: "Dispute fee",
      cell: (o) => (o.fee > 0 ? `${money(o.fee)}${o.move === "fight" ? " if lost" : ""}` : "None"),
    },
    {
      label: "Counts toward ratio",
      cell: (o) => (
        <span className={o.countsAsClaim ? "text-warn-700" : undefined}>
          {o.countsAsClaim ? "Yes" : "No"}
        </span>
      ),
    },
  ];

  return (
    <div>
      <h3 className="text-ink text-[15px] font-semibold">What each move costs</h3>
      <table className="mt-3 w-full table-fixed border-separate border-spacing-0 text-left">
        <colgroup>
          <col className="w-[34%]" />
          {options.map((o) => (
            <col key={o.move} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Move</span>
            </th>
            {options.map((o) => {
              const pick = o.move === recommended;
              return (
                <th
                  key={o.move}
                  scope="col"
                  className={cn(
                    "rounded-t-[10px] px-3 pt-2.5 pb-2 align-bottom",
                    pick && "bg-mist",
                  )}
                >
                  <Tooltip content={o.available ? o.note : `Not available: ${lower(o.note)}`}>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-[13.5px] font-semibold",
                        o.available ? "text-ink" : "text-ink-3",
                      )}
                    >
                      {pick && (
                        <span className="bg-lemon flex size-4 items-center justify-center rounded-full">
                          <Check className="text-ink size-2.5" strokeWidth={3.5} />
                        </span>
                      )}
                      {MOVE[o.move]}
                    </span>
                  </Tooltip>
                  <span className="sr-only">
                    {pick && " (Truce's pick)"}:{" "}
                    {o.available ? o.note : `not available, ${lower(o.note)}`}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => {
            const last = r === rows.length - 1;
            return (
              <tr key={row.label}>
                <th
                  scope="row"
                  className="border-line-soft text-ink-2 border-t py-2.5 pr-3 align-top text-[13px] font-normal"
                >
                  {row.label}
                </th>
                {options.map((o, i) => (
                  <td
                    key={o.move}
                    className={cn(
                      "border-line-soft text-ink border-t px-3 py-2.5 align-top text-[13px] tabular-nums sm:text-[14px]",
                      o.move === recommended && "bg-mist",
                      o.move === recommended && last && "rounded-b-[10px]",
                    )}
                  >
                    {o.available ? (
                      row.cell(o, i)
                    ) : r === 0 ? (
                      <span className="text-ink-3">Not open</span>
                    ) : (
                      <span className="text-ink-3">&mdash;</span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
