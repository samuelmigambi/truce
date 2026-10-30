"use client";

import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";

/** Moves focus back to the open step's title, after something on the step disappears. */
export function focusStepHeading() {
  document.querySelector<HTMLElement>("[data-step-heading]")?.focus({ preventScroll: true });
}

/** What every step gets from the flow. */
export interface StepBase {
  focusOnMount: boolean;
  /** Missing on the first step. */
  onBack?: () => void;
}

/**
 * Every onboarding step's card: the title, a line on why the step matters, the step's own
 * content, and the footer with Back and Continue. Failures show as toasts. When
 * a step opens, focus moves to its title so keyboard and screen reader users start there.
 */
export function StepFrame({
  title,
  description,
  focusOnMount,
  onSubmit,
  footer,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** True once the person has moved between steps; the first page load keeps the browser's focus. */
  focusOnMount: boolean;
  /** Makes the content and footer a form, so Enter in a field continues. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!focusOnMount) return;
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [focusOnMount]);

  const inner = (
    <>
      {children && <div className="px-5 pt-6 pb-6 sm:px-8 sm:pb-8">{children}</div>}
      {footer && (
        <div className="border-line-soft bg-cream/60 rounded-b-panel border-t px-5 py-4 sm:px-8">
          {footer}
        </div>
      )}
    </>
  );

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "rounded-panel border-line bg-paper border shadow-[0_1px_2px_rgb(30_38_20/0.04)]",
        className,
      )}
    >
      <header className="px-5 pt-6 sm:px-8 sm:pt-8">
        <h1
          id={titleId}
          ref={heading}
          tabIndex={-1}
          data-step-heading
          className="text-ink text-[22px] leading-tight font-semibold tracking-[-0.02em] text-balance focus:outline-none sm:text-[26px]"
        >
          {title}
        </h1>
        {description && (
          <p className="text-ink-2 mt-2 max-w-[560px] text-[15px] leading-relaxed text-pretty">
            {description}
          </p>
        )}
      </header>
      {onSubmit ? (
        <form method="post" noValidate onSubmit={onSubmit} aria-labelledby={titleId}>
          {inner}
        </form>
      ) : (
        inner
      )}
    </section>
  );
}

/** Back sits right beside the step's actions, with a note to their left on wide screens. */
export function StepFooter({
  onBack,
  note,
  children,
}: {
  onBack?: () => void;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-end gap-3">
      {note && <p className="text-ink-2 mr-auto hidden text-[13px] sm:block">{note}</p>}
      <div className="flex min-w-0 items-center gap-2">
        {onBack && (
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
        )}
        {children}
      </div>
    </div>
  );
}
