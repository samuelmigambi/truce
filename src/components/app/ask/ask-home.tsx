"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { NEW_CHAT, openChat, showChat, startNewChat } from "@/lib/client/chat";
import { shopHref } from "@/lib/client/api";
import { useShopId } from "@/lib/client/shop-context";
import { Chat } from "./chat";
import { ChatTopBar } from "./chat-top-bar";
import { RecentChats } from "./recent-chats";

/**
 * The shop's home: Ask Truce. The open chat lives in the address (`?chat=<id>`), so a chat can
 * be reloaded, bookmarked or reopened with Back. Without one it's a new chat, with the person's
 * recent chats under the input. Moving between chats changes the address in place, so the next
 * chat shows at once.
 */
export function AskHome() {
  const shopId = useShopId();
  const pathname = usePathname();
  const chatId = useSearchParams().get("chat");
  const home = shopHref(shopId);

  useEffect(() => {
    if (chatId) openChat(shopId, chatId);
    else startNewChat(shopId);
  }, [shopId, chatId]);

  return (
    <Chat
      chatKey={chatId ?? NEW_CHAT}
      variant="page"
      below={chatId ? undefined : <RecentChats />}
      onSaved={(id) => {
        // Only while the person is still on this new chat; they may have moved on meanwhile.
        const here = new URL(window.location.href);
        if (here.pathname !== pathname || here.searchParams.get("chat")) return;
        here.searchParams.set("chat", id);
        window.history.replaceState(null, "", `${here.pathname}${here.search}`);
      }}
      onNewChat={() => showChat(home)}
      topBar={<ChatTopBar chatKey={chatId ?? NEW_CHAT} onNewChat={() => showChat(home)} />}
    />
  );
}
