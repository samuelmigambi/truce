"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { duration, ease } from "../../motion";
import { Button } from "../../ui/button";
import { cn } from "../../ui/cn";

/** One part of Settings: a card with its own heading, so the page nav can jump straight to it. */
export function SettingsSection({
  id,
  title,
  description,
  aside,
  children,
  footer,
  onSubmit,
  tone = "default",
  className,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** Something small on the heading's line, such as a status chip. */
  aside?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Makes the body and footer one form, so Enter in a field saves. */
  onSubmit?: () => void;
  tone?: "default" | "danger";
  className?: string;
}) {
  const headingId = `${id}-title`;
  const body = (
    <>
      <div className="px-5 pb-5 sm:px-6">{children}</div>
      {footer}
    </>
  );
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        "rounded-card bg-paper scroll-mt-24 border lg:scroll-mt-8",
        tone === "danger" ? "border-risk-200" : "border-line",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id={headingId} className="text-ink text-[16px] leading-6 font-semibold">
            {title}
          </h2>
          {description && (
            <p className="text-ink-2 mt-0.5 max-w-[560px] text-[13px] leading-5 text-pretty">
              {description}
            </p>
          )}
        </div>
        {aside && <div className="flex shrink-0 items-center gap-2 pt-0.5">{aside}</div>}
      </div>
      {onSubmit ? (
        <form
          noValidate
          aria-labelledby={headingId}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {body}
        </form>
      ) : (
        body
      )}
    </section>
  );
}

/**
 * The bottom of a form section: what's unsaved, a way to undo it, and Save, which submits the
 * section's form. Save stays put so the layout never jumps.
 */
export function SaveBar({
  dirty,
  saving,
  onDiscard,
  note,
  label = "Save",
  disabled = false,
}: {
  dirty: boolean;
  saving: boolean;
  onDiscard: () => void;
  /** Said when nothing has changed. */
  note?: ReactNode;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className="border-line-soft bg-cream/50 flex flex-wrap items-center justify-between gap-3 rounded-b-[11px] border-t px-5 py-3 sm:px-6">
      <p className="text-ink-2 min-h-5 text-[13px]" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={dirty ? "dirty" : "clean"}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0, transition: { duration: duration.fast, ease: ease.out } }}
            exit={{ opacity: 0, transition: { duration: duration.instant } }}
            className="inline-flex items-center gap-2"
          >
            {dirty ? (
              <>
                <span aria-hidden className="bg-warn-500 size-1.5 rounded-full" />
                Unsaved changes
              </>
            ) : (
              note
            )}
          </motion.span>
        </AnimatePresence>
      </p>
      <div className="flex items-center gap-2">
        {dirty && !saving && (
          <Button variant="ghost" size="sm" onClick={onDiscard}>
            Discard
          </Button>
        )}
        <Button size="sm" type="submit" loading={saving} disabled={!dirty || disabled}>
          {label}
        </Button>
      </div>
    </div>
  );
}

/** Asks before the tab closes while a section has unsaved changes. */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}
