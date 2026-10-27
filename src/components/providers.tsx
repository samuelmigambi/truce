"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/client/api";
import { duration, ease } from "./motion";
import { ToastProvider } from "./ui/toast";

/** App-wide context: one motion rhythm that honours reduced motion, SWR, and toasts. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: duration.base, ease: ease.out }}>
      <SWRConfig value={{ fetcher, shouldRetryOnError: false, keepPreviousData: true }}>
        <ToastProvider>{children}</ToastProvider>
      </SWRConfig>
    </MotionConfig>
  );
}
