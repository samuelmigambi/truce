"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { SimilarCase } from "@/lib/domain";
import { OutcomeChip } from "../case-chips";

/** Closed cases like this one, found by meaning rather than keywords. */
export function SimilarCases({ cases }: { cases: SimilarCase[] }) {
  if (!cases.length)
    return <p className="text-ink-2 text-[13px]">No closed cases like this one yet.</p>;
  return (
    <ul className="space-y-1">
      {cases.map((c) => (
        <li key={c.caseId}>
          <Link
            href={`/app/cases/${encodeURIComponent(c.caseId)}`}
            className="group hover:bg-cream -mx-2 flex items-start gap-3 rounded-[10px] px-2 py-2 transition-colors"
          >
            <span className="text-ink-2 mt-0.5 w-10 shrink-0 text-xs font-medium tabular-nums">
              {Math.round(c.similarity * 100)}%
            </span>
            <span className="text-ink min-w-0 flex-1 text-[13px] leading-relaxed">{c.summary}</span>
            {c.outcome && <OutcomeChip outcome={c.outcome} size="sm" />}
            <ArrowUpRight className="text-ink-3 group-hover:text-ink mt-0.5 size-3.5 shrink-0 transition-colors" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
