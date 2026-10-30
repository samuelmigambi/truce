"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { duration, ease, spring } from "../motion";
import { cn } from "./cn";
import { Portal } from "./overlay";

export type ToastTone = "success" | "info" | "warning" | "error";

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** A link or button on the toast, such as "Sign in instead". Using it closes the toast. */
  action?: { label: string; href: string } | { label: string; onClick: () => void };
  /**
   * Toasts with the same key replace each other, so trying a form again doesn't stack the same
   * message twice.
   */
  key?: string;
  /** Milliseconds; errors and warnings stay a little longer. */
  duration?: number;
}

interface ToastItem extends Required<Pick<ToastOptions, "title" | "tone">> {
  id: number;
  key?: string;
  description?: string;
  action?: ToastOptions["action"];
  duration: number;
}

type ToastFn = (options: ToastOptions) => void;

const ToastContext = createContext<ToastFn>(() => {});

/** Shows a toast: `const toast = useToast(); toast({ title: "Sent" })`. */
export function useToast(): ToastFn {
  return useContext(ToastContext);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastFn>((options) => {
    const tone = options.tone ?? "success";
    const item: ToastItem = {
      id: nextId++,
      key: options.key,
      title: options.title,
      description: options.description,
      action: options.action,
      tone,
      duration: options.duration ?? (tone === "error" || tone === "warning" ? 7000 : 4500),
    };
    setItems((list) => {
      const others = item.key ? list.filter((t) => t.key !== item.key) : list;
      return [...others.slice(-2), item];
    });
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <Portal>
        <div
          aria-live="polite"
          aria-relevant="additions"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
        >
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <ToastCard key={item.id} item={item} onDismiss={dismiss} />
            ))}
          </AnimatePresence>
        </div>
      </Portal>
    </ToastContext.Provider>
  );
}

const icons = {
  success: <Check strokeWidth={2.5} />,
  info: <Info />,
  warning: <TriangleAlert />,
  error: <CircleAlert />,
};

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(item.duration);
  const startedAt = useRef(0);

  useEffect(() => {
    if (paused) return;
    startedAt.current = performance.now();
    const timer = window.setTimeout(() => onDismiss(item.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(
        1200,
        remaining.current - (performance.now() - startedAt.current),
      );
    };
  }, [paused, item.id, onDismiss]);

  return (
    <motion.div
      layout
      role={item.tone === "error" || item.tone === "warning" ? "alert" : "status"}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      className="rounded-card border-line bg-paper shadow-pop pointer-events-auto flex w-full max-w-[380px] items-start gap-3 border p-3.5 pr-2.5"
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: spring.panel }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: duration.fast, ease: ease.in } }}
    >
      <span
        className={cn(
          "mt-px flex size-6 shrink-0 items-center justify-center rounded-full [&_svg]:size-3.5",
          item.tone === "success" && "bg-lemon text-ink",
          item.tone === "info" && "bg-mist text-moss-deep",
          item.tone === "warning" && "bg-warn-50 text-warn-700",
          item.tone === "error" && "bg-risk-50 text-risk-700",
        )}
      >
        {icons[item.tone]}
      </span>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="text-ink text-sm leading-5 font-medium">{item.title}</p>
        {item.description && (
          <p className="text-ink-2 mt-0.5 text-[13px] leading-5">{item.description}</p>
        )}
        {item.action && <ToastAction action={item.action} onDone={() => onDismiss(item.id)} />}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onDismiss(item.id)}
        className="text-ink-3 hover:bg-wash hover:text-ink flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors [&_svg]:size-3.5"
      >
        <X />
      </button>
    </motion.div>
  );
}

function ToastAction({
  action,
  onDone,
}: {
  action: NonNullable<ToastOptions["action"]>;
  onDone: () => void;
}) {
  const className =
    "text-moss-deep mt-1.5 inline-flex rounded-md text-[13px] font-medium underline-offset-2 hover:underline";
  if ("href" in action && /^https?:/.test(action.href)) {
    return (
      <a href={action.href} target="_blank" rel="noreferrer" onClick={onDone} className={className}>
        {action.label}
      </a>
    );
  }
  if ("href" in action) {
    return (
      <Link href={action.href} onClick={onDone} className={className}>
        {action.label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        action.onClick();
        onDone();
      }}
      className={className}
    >
      {action.label}
    </button>
  );
}
