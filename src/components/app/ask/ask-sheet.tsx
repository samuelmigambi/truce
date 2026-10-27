"use client";

import { AnimatePresence, motion } from "motion/react";
import { Maximize2, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { closeAsk, openAsk, toggleAsk, useAsk } from "@/lib/client/ask";
import { useModKey } from "@/lib/client/platform";
import { useChat } from "@/lib/client/chat";
import { spring } from "../../motion";
import { IconButton } from "../../ui/button";
import { Kbd } from "../../ui/kbd";
import { LogoTile, ThinkingMark } from "../../ui/logo";
import { Sheet } from "../../ui/overlay";
import { Chat } from "./chat";

/** The case on screen, if the seller is looking at one. */
function caseFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/app\/cases\/([^/]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/**
 * Ask Truce as a slide-over, from any app page: a floating button, or Ctrl/⌘ K. On a case file
 * it knows which case the seller means.
 */
export function AskSheet() {
  const { open, draft, nonce } = useAsk();
  const pathname = usePathname();
  const onAskPage = pathname === "/app/ask";
  const caseId = caseFromPath(pathname);
  const { busy } = useChat();
  const mod = useModKey();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault();
        if (pathname === "/app/ask") return;
        toggleAsk();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname]);

  return (
    <>
      <AnimatePresence>
        {!onAskPage && !caseId && !open && (
          <motion.button
            type="button"
            onClick={() => openAsk()}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: spring.panel }}
            exit={{ opacity: 0, y: 12, scale: 0.96, transition: { duration: 0.14 } }}
            aria-label="Ask Truce"
            className="border-line bg-paper text-ink shadow-pop hover:border-line-strong fixed right-4 bottom-4 z-40 flex h-12 items-center gap-2.5 rounded-full border p-1.5 text-sm font-medium transition-[border-color,transform] active:scale-[0.98] sm:right-6 sm:bottom-6 sm:pr-4"
          >
            {busy ? <ThinkingMark className="size-9" /> : <LogoTile className="size-9" />}
            <span className="max-sm:hidden">Ask Truce</span>
            <span className="flex items-center gap-0.5 max-sm:hidden">
              <Kbd>{mod}</Kbd>
              <Kbd>K</Kbd>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <Sheet
        open={open && !onAskPage}
        onClose={closeAsk}
        title="Ask Truce"
        header={false}
        width="sm:max-w-[480px]"
      >
        <div className="border-line-soft flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
          <div className="flex items-center gap-2.5">
            <LogoTile className="size-7" />
            <h2 className="text-ink text-[15px] font-semibold">Ask Truce</h2>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/app/ask"
              onClick={closeAsk}
              aria-label="Open Ask Truce full page"
              title="Open full page"
              className="rounded-btn text-ink-2 hover:bg-wash hover:text-ink flex size-8 items-center justify-center transition-colors"
            >
              <Maximize2 className="size-4" />
            </Link>
            <IconButton label="Close" size="sm" onClick={closeAsk}>
              <X />
            </IconButton>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <Chat
            variant="sheet"
            caseId={caseId}
            initialDraft={draft}
            draftNonce={nonce}
            onNavigate={closeAsk}
          />
        </div>
      </Sheet>
    </>
  );
}
