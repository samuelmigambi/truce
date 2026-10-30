"use client";

import { Maximize2, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { shopHref } from "@/lib/client/api";
import { closeAsk, focusAskInput, toggleAsk, useAsk } from "@/lib/client/ask";
import { NEW_CHAT, useActiveChat } from "@/lib/client/chat";
import { useShopId } from "@/lib/client/shop-context";
import { IconButton } from "../../ui/button";
import { LogoTile } from "../../ui/logo";
import { Sheet } from "../../ui/overlay";
import { Chat } from "./chat";

/** The case on screen, if the seller is looking at one: /app/<shop>/cases/<case>. */
function caseFromPath(pathname: string, shopId: string): string | null {
  const prefix = `${shopHref(shopId, "cases")}/`;
  if (!pathname.startsWith(prefix)) return null;
  const id = pathname.slice(prefix.length).split("/")[0];
  if (!id) return null;
  try {
    return decodeURIComponent(id);
  } catch {
    return null;
  }
}

/**
 * Ask Truce as a slide-over, from any screen in the shop: the Ask Truce buttons on cases and orders,
 * or Ctrl/⌘ K. On a case file it knows which case the seller means.
 */
export function AskSheet() {
  const shopId = useShopId();
  const { open, draft, nonce } = useAsk(shopId);
  const pathname = usePathname();
  // Ask Truce is the shop's home page, where the sheet isn't needed.
  const askPage = shopHref(shopId);
  const onAskPage = pathname === askPage;
  const caseId = caseFromPath(pathname, shopId);
  const active = useActiveChat(shopId);
  // The full page opens the same chat, by its address once it has one.
  const fullPage = active === NEW_CHAT ? askPage : `${askPage}?chat=${encodeURIComponent(active)}`;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault();
        if (pathname === askPage) focusAskInput();
        else toggleAsk(shopId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, askPage, shopId]);

  return (
    <Sheet
      open={open && !onAskPage}
      onClose={() => closeAsk(shopId)}
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
            href={fullPage}
            onClick={() => closeAsk(shopId)}
            aria-label="Open Ask Truce full page"
            title="Open full page"
            className="rounded-btn text-ink-2 hover:bg-wash hover:text-ink flex size-8 items-center justify-center transition-colors"
          >
            <Maximize2 className="size-4" />
          </Link>
          <IconButton label="Close" size="sm" onClick={() => closeAsk(shopId)}>
            <X />
          </IconButton>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <Chat
          chatKey={active}
          variant="sheet"
          caseId={caseId}
          initialDraft={draft}
          draftNonce={nonce}
          onNavigate={() => closeAsk(shopId)}
        />
      </div>
    </Sheet>
  );
}
