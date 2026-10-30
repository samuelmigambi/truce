"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { duration, ease, spring } from "../motion";
import { IconButton } from "./button";
import { cn } from "./cn";

const noop = () => () => {};

/** True once the component runs in the browser; portals need a document. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export function Portal({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  return mounted ? createPortal(children, document.body) : null;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

let locks = 0;

/**
 * Keeps keyboard focus inside an open dialog or sheet, closes it on Escape, stops the page
 * behind it from scrolling, and puts focus back where it was when it closes.
 */
function useModal(
  panel: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocus?: RefObject<HTMLElement | null>,
) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    locks++;
    root.style.overflow = "hidden";

    const frame = requestAnimationFrame(() => {
      const target =
        initialFocus?.current ??
        panel.current?.querySelector<HTMLElement>("[data-autofocus]") ??
        panel.current;
      target?.focus({ preventScroll: true });
    });

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      locks--;
      if (locks <= 0) {
        locks = 0;
        root.style.overflow = "";
      }
      previous?.focus?.({ preventScroll: true });
    };
  }, [panel, initialFocus]);
}

function Backdrop({ onClick }: { onClick: () => void }) {
  return (
    <motion.div
      aria-hidden
      onClick={onClick}
      className="fixed inset-0 z-50 bg-[#1e2614]/30 backdrop-blur-[2px] dark:bg-black/50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: duration.base, ease: ease.out }}
    />
  );
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  initialFocus?: RefObject<HTMLElement | null>;
}

const widths = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" };

/** A centered dialog for one focused task, such as adding tracking or confirming a reset. */
export function Dialog(props: DialogProps) {
  return (
    <Portal>
      <AnimatePresence>{props.open && <DialogPanel {...props} />}</AnimatePresence>
    </Portal>
  );
}

function DialogPanel({
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  initialFocus,
}: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useModal(panel, onClose, initialFocus);

  return (
    <>
      <Backdrop onClick={onClose} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
        <motion.div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className={cn(
            "rounded-panel border-line bg-paper shadow-dialog pointer-events-auto relative flex max-h-[calc(100dvh-24px)] w-full flex-col overflow-hidden border outline-none",
            widths[size],
          )}
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            transition: { duration: duration.slow, ease: ease.out },
          }}
          exit={{
            opacity: 0,
            y: 6,
            scale: 0.985,
            transition: { duration: duration.fast, ease: ease.in },
          }}
        >
          <div
            className={cn("flex items-start justify-between gap-4 px-6 pt-5", !children && "pb-7")}
          >
            <div className="min-w-0">
              <h2 id={titleId} className="text-ink text-[17px] leading-6 font-semibold">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="text-ink-2 mt-1 text-sm leading-5">
                  {description}
                </p>
              )}
            </div>
            <IconButton label="Close" size="sm" onClick={onClose} className="-mt-1 -mr-2">
              <X />
            </IconButton>
          </div>
          {children && <div className="min-h-0 overflow-y-auto px-6 pt-4 pb-7">{children}</div>}
          {footer && (
            <div className="border-line-soft bg-cream/60 flex flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row sm:justify-end">
              {footer}
            </div>
          )}
        </motion.div>
      </div>
    </>
  );
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Names the sheet for screen readers; shown when `header` is true. */
  title: string;
  side?: "left" | "right";
  children: ReactNode;
  className?: string;
  /** Show the built-in title bar with a close button. */
  header?: boolean;
  initialFocus?: RefObject<HTMLElement | null>;
  /** Replaces the white surface, for the shop's warmer look. */
  surface?: string;
  /** The panel's widest size, as a class. */
  width?: string;
}

/** A panel that slides in from the edge: the mobile nav, Ask Truce, the cart. */
export function Sheet(props: SheetProps) {
  return (
    <Portal>
      <AnimatePresence>{props.open && <SheetPanel {...props} />}</AnimatePresence>
    </Portal>
  );
}

function SheetPanel({
  onClose,
  title,
  side = "right",
  children,
  className,
  header = true,
  initialFocus,
  surface = "bg-paper border-line",
  width,
}: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModal(panel, onClose, initialFocus);
  const from = side === "right" ? "100%" : "-100%";

  return (
    <>
      <Backdrop onClick={onClose} />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={header ? titleId : undefined}
        aria-label={header ? undefined : title}
        tabIndex={-1}
        className={cn(
          "shadow-dialog fixed inset-y-0 z-50 flex w-full flex-col outline-none",
          surface,
          side === "right" ? "right-0 border-l" : "left-0 border-r",
          width ?? (side === "right" ? "sm:max-w-[440px]" : "max-w-[300px]"),
          className,
        )}
        initial={{ x: from }}
        animate={{ x: 0, transition: spring.panel }}
        exit={{ x: from, transition: { duration: duration.base, ease: ease.in } }}
      >
        {header && (
          <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-current/10 px-5">
            <h2 id={titleId} className="text-[15px] font-semibold">
              {title}
            </h2>
            <IconButton label="Close" size="sm" onClick={onClose} className="-mr-2">
              <X />
            </IconButton>
          </div>
        )}
        {children}
      </motion.div>
    </>
  );
}
