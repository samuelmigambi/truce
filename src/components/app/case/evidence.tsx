"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { EvidenceRecord } from "@/lib/domain";
import { useShopDates } from "@/lib/client/shop-context";
import { duration, ease } from "../../motion";
import { cn } from "../../ui/cn";
import { Tooltip } from "../../ui/tooltip";

/**
 * Evidence chips and the records they point to are linked: hovering "E2" anywhere in the case
 * file lights up record E2, and clicking it scrolls there.
 */

interface EvidenceState {
  active: string | null;
  flashing: string | null;
  setActive: (id: string | null) => void;
  reveal: (id: string) => void;
  records: Map<string, EvidenceRecord>;
}

const EvidenceContext = createContext<EvidenceState | null>(null);

export function EvidenceProvider({
  records,
  children,
}: {
  records: EvidenceRecord[];
  children: ReactNode;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [flashing, setFlashing] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const map = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);

  const reveal = useCallback((id: string) => {
    document
      .getElementById(`evidence-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashing(id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlashing(null), 1400);
  }, []);

  const value = useMemo(
    () => ({ active, flashing, setActive, reveal, records: map }),
    [active, flashing, reveal, map],
  );
  return <EvidenceContext.Provider value={value}>{children}</EvidenceContext.Provider>;
}

function useEvidence(): EvidenceState | null {
  return useContext(EvidenceContext);
}

/** "E2": hover to light up the record, click to go to it. */
export function EvidenceChip({ id, className }: { id: string; className?: string }) {
  const evidence = useEvidence();
  const record = evidence?.records.get(id);
  const lit = evidence?.active === id;
  const chip = (
    <button
      type="button"
      onPointerEnter={() => evidence?.setActive(id)}
      onPointerLeave={() => evidence?.setActive(null)}
      onFocus={() => evidence?.setActive(id)}
      onBlur={() => evidence?.setActive(null)}
      onClick={() => evidence?.reveal(id)}
      aria-label={record ? `Evidence ${id}: ${record.title}` : `Evidence ${id}`}
      className={cn(
        "inline-flex h-[20px] items-center rounded-[6px] px-1.5 align-[1px] text-[11px] font-semibold tabular-nums transition-[background-color,color,box-shadow] duration-150",
        lit ? "bg-ink text-lemon" : "bg-mist text-moss-deep hover:bg-lemon hover:text-ink",
        className,
      )}
    >
      {id}
    </button>
  );
  if (!record) return chip;
  return (
    <Tooltip content={record.title} delay={450}>
      {chip}
    </Tooltip>
  );
}

export function EvidenceChips({ ids, className }: { ids: string[]; className?: string }) {
  if (!ids.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {ids.map((id) => (
        <EvidenceChip key={id} id={id} />
      ))}
    </span>
  );
}

/** The records the agent gathered, each with what it shows and the day it's from. */
export function EvidenceList({ records }: { records: EvidenceRecord[] }) {
  const evidence = useEvidence();
  const dates = useShopDates();
  return (
    <ul className="space-y-2">
      {records.map((r, i) => {
        const lit = evidence?.active === r.id || evidence?.flashing === r.id;
        return (
          <motion.li
            key={r.id}
            id={`evidence-${r.id}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.base, ease: ease.out, delay: i * 0.03 }}
            onPointerEnter={() => evidence?.setActive(r.id)}
            onPointerLeave={() => evidence?.setActive(null)}
            className={cn(
              "relative scroll-mt-24 rounded-[10px] border px-3.5 py-3 transition-[background-color,border-color,box-shadow] duration-200",
              lit
                ? "bg-mist border-[#cfdf7f] shadow-[0_0_0_3px_rgb(221_235_148/0.6)]"
                : "border-line-soft bg-paper",
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "inline-flex h-[22px] min-w-[30px] shrink-0 items-center justify-center rounded-[6px] text-[11px] font-semibold tabular-nums transition-colors",
                  lit ? "bg-ink text-lemon" : "bg-ink/[0.06] text-ink",
                )}
              >
                {r.id}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-ink text-[14px] leading-snug font-medium">{r.title}</p>
                  {r.at && (
                    <time dateTime={r.at} className="text-ink-3 shrink-0 text-[13px] tabular-nums">
                      {dates.date(r.at)}
                    </time>
                  )}
                </div>
                <Summary text={r.summary} />
              </div>
            </div>
            <AnimatePresence>
              {evidence?.flashing === r.id && (
                <motion.span
                  aria-hidden
                  className="ring-moss pointer-events-none absolute inset-0 rounded-[10px] ring-2"
                  initial={{ opacity: 0.9 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.2, ease: ease.out }}
                />
              )}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </ul>
  );
}

/** Long records (every scan of a parcel) fold to three lines until asked. */
function Summary({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 240;
  return (
    <div className="mt-1">
      <p className={cn("text-ink-2 text-[13px] leading-relaxed", long && !open && "line-clamp-3")}>
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className="text-moss hover:text-moss-deep mt-1 text-[13px] font-medium transition-colors"
        >
          {open ? "Show less" : "Show all"}
        </button>
      )}
    </div>
  );
}
