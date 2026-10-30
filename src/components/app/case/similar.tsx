"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { SimilarCase } from "@/lib/domain";
import { shopHref } from "@/lib/client/api";
import { useCases } from "@/lib/client/hooks";
import { useShopId } from "@/lib/client/shop-context";
import { Avatar } from "../../ui/avatar";
import { OutcomeChip } from "../case-chips";

/**
 * Closed cases like this one, found by meaning rather than keywords, nearest first. Each shows
 * whose case it was, since cases about the same item can read alike.
 */
export function SimilarCases({ cases }: { cases: SimilarCase[] }) {
  const shopId = useShopId();
  const known = useCases().data?.cases;
  const buyer = (caseId: string) => known?.find((c) => c.id === caseId)?.buyer.name;
  if (!cases.length)
    return <p className="text-ink-2 text-[13px]">No closed cases like this one yet.</p>;
  return (
    <ul className="space-y-1">
      {cases.map((c) => {
        const name = buyer(c.caseId);
        return (
          <li key={c.caseId}>
            <Link
              href={shopHref(shopId, `cases/${encodeURIComponent(c.caseId)}`)}
              className="group hover:bg-cream -mx-2.5 flex items-center gap-3 rounded-[10px] px-2.5 py-2.5 transition-colors"
            >
              {name && <Avatar name={name} />}
              <span className="min-w-0 flex-1">
                {name && <span className="text-ink block text-[14px] font-medium">{name}</span>}
                <span className="text-ink-2 block text-[13.5px] leading-relaxed">{c.summary}</span>
              </span>
              {c.outcome && <OutcomeChip outcome={c.outcome} />}
              <ArrowUpRight className="text-ink-3 group-hover:text-ink size-4 shrink-0 transition-colors" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
