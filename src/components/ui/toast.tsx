"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CircleAlert, Info, X } from "lucide-react";
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

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: "success" | "info" | "error";
  /** Milliseconds; errors stay a little longer. */
  duration?: number;
}

interface ToastItem extends Required<Pick<ToastOptions, "title" | "tone">> {
  id: number;
  description?: string;
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
      title: options.title,
      description: options.description,
      tone,
      duration: options.duration ?? (tone === "error" ? 7000 : 4500),
    };
    setItems((list) => [...list.slice(-2), item]);
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
      role={item.tone === "error" ? "alert" : "status"}
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
