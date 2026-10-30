"use client";

import { Menu, Plus } from "lucide-react";
import Link from "next/link";
import { dayLabel, timeAgo } from "@/lib/client/format";
import { chatHref, followChatLink, useChatThread } from "@/lib/client/chat";
import { useChats } from "@/lib/client/hooks";
import { useShopDates, useShopId } from "@/lib/client/shop-context";
import type { ChatSummary } from "@/lib/chat-thread";
import { Button } from "../../ui/button";
import { cn } from "../../ui/cn";
import { Popover, triggerProps, usePopover } from "../../ui/popover";
import { Skeleton } from "../../ui/skeleton";

/**
 * The bar over an open chat: a menu with the person's chat history, and a button for a new chat.
 * It stays at the top of the window, on a solid background, as the conversation scrolls.
 */
export function ChatTopBar({ chatKey, onNewChat }: { chatKey: string; onNewChat: () => void }) {
  const shopId = useShopId();
  const control = usePopover();
  const thread = useChatThread(shopId, chatKey);

  return (
    // Just inside the panel's top edge; under its rounded cap, so the cap's corners round it off.
    <div className="bg-cream sticky top-[calc(var(--app-top,0px)+var(--app-gutter,0px)+1px)] z-10">
      <div className="mx-auto flex h-14 w-full max-w-[760px] items-center justify-between gap-2 px-2 sm:px-4">
        <button
          {...triggerProps(control, "dialog")}
          aria-label="Chat history"
          className={cn(
            "rounded-btn text-ink-2 hover:bg-wash hover:text-ink flex size-9 items-center justify-center transition-colors",
            control.open && "bg-wash text-ink",
          )}
        >
          <Menu className="size-[18px]" />
        </button>
        <Button size="sm" variant="secondary" icon={<Plus />} onClick={onNewChat}>
          New chat
        </Button>
      </div>

      <Popover
        control={control}
        kind="dialog"
        label="Chat history"
        placement="bottom-start"
        width={320}
        room={240}
      >
        <ChatHistory currentId={thread.chatId} onOpen={() => control.hide()} />
      </Popover>
    </div>
  );
}

/** The person's chats in this shop, by day, in the history menu. */
function ChatHistory({ currentId, onOpen }: { currentId: string | null; onOpen: () => void }) {
  const shopId = useShopId();
  const { now, timeZone } = useShopDates();
  const { data, error } = useChats();

  if (error) {
    return <p className="text-ink-2 px-4 py-5 text-[13px]">Your chats didn&rsquo;t load.</p>;
  }
  if (!data) {
    return (
      <div className="space-y-3 p-4" aria-busy="true">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3.5 w-1/2" />
      </div>
    );
  }
  if (data.chats.length === 0) {
    return <p className="text-ink-2 px-4 py-5 text-[13px]">No chats yet.</p>;
  }

  const groups: { label: string; chats: ChatSummary[] }[] = [];
  for (const chat of data.chats) {
    const label = dayLabel(chat.updatedAt, now, timeZone);
    const last = groups.at(-1);
    if (last?.label === label) last.chats.push(chat);
    else groups.push({ label, chats: [chat] });
  }

  return (
    <div className="max-h-[420px] min-h-0 overflow-y-auto p-1.5">
      {groups.map((group) => (
        <div key={group.label} className="pb-1">
          <p className="text-ink-3 px-2.5 pt-2 pb-1 text-xs font-medium">{group.label}</p>
          <ul>
            {group.chats.map((chat) => {
              const current = chat.id === currentId;
              return (
                <li key={chat.id}>
                  <Link
                    href={chatHref(shopId, chat.id)}
                    onClick={(event) => {
                      followChatLink(event);
                      onOpen();
                    }}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "block rounded-lg px-2.5 py-2 transition-colors",
                      current ? "bg-wash" : "hover:bg-wash",
                    )}
                  >
                    <span className="text-ink block truncate text-[13.5px]">{chat.title}</span>
                    <span className="text-ink-3 block text-xs">
                      {timeAgo(chat.updatedAt, now, timeZone)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
