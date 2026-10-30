"use client";

import { motion } from "motion/react";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { ChatSummary } from "@/lib/chat-thread";
import { chatHref, deleteChat, followChatLink, renameChat } from "@/lib/client/chat";
import { errorMessage } from "@/lib/client/api";
import { dayLabel, timeAgo } from "@/lib/client/format";
import { useChats } from "@/lib/client/hooks";
import { useShopDates, useShopId } from "@/lib/client/shop-context";
import { duration, ease } from "../../motion";
import { Button } from "../../ui/button";
import { cn } from "../../ui/cn";
import { Input } from "../../ui/field";
import { FormField } from "../../ui/form-field";
import { Dialog } from "../../ui/overlay";
import { MenuButton, MenuDivider, Popover, triggerProps, usePopover } from "../../ui/popover";
import { Skeleton } from "../../ui/skeleton";
import { useToast } from "../../ui/toast";

/** How many show before "Show all". */
const FIRST = 8;

/** Chats grouped by the day they were last used, in the shop's calendar: Today, Yesterday… */
function byDay(chats: ChatSummary[], now: number, timeZone: string) {
  const groups: { label: string; chats: ChatSummary[] }[] = [];
  for (const chat of chats) {
    const label = dayLabel(chat.updatedAt, now, timeZone);
    const group = groups.at(-1);
    if (group?.label === label) group.chats.push(chat);
    else groups.push({ label, chats: [chat] });
  }
  return groups;
}

/**
 * The person's chats in this shop, grouped by day with the most recent first, under the input on
 * the home page. Each opens where it left off; its menu renames, shares or deletes it.
 */
export function RecentChats() {
  const shopId = useShopId();
  const { now, timeZone } = useShopDates();
  const { data, error, mutate } = useChats();
  const toast = useToast();
  const [all, setAll] = useState(false);
  const [deleting, setDeleting] = useState<ChatSummary | null>(null);
  const [renaming, setRenaming] = useState<ChatSummary | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteChat(shopId, deleting.id);
      setDeleting(null);
    } catch (e) {
      toast({ title: "Couldn't delete the chat", description: errorMessage(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(chat: ChatSummary) {
    const url = `${window.location.origin}${chatHref(shopId, chat.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "Only you can open this chat." });
    } catch {
      toast({ title: "Couldn't copy the link", description: url, tone: "error" });
    }
  }

  const heading = <h2 className="text-ink text-[15px] font-semibold">Recent chats</h2>;

  if (error) {
    return (
      <section aria-label="Recent chats">
        {heading}
        <div className="rounded-card border-line-soft bg-paper mt-3 flex flex-wrap items-center justify-between gap-3 border px-4 py-3.5">
          <p className="text-ink-2 text-[13px]">Your chats didn&rsquo;t load.</p>
          <Button size="sm" variant="secondary" onClick={() => void mutate()}>
            Try again
          </Button>
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section aria-label="Recent chats" aria-busy="true">
        {heading}
        <div className="mt-3 space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="rounded-card border-line-soft bg-paper border px-4 py-3.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="mt-2 h-3 w-16" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Nothing to show yet: the starters above are enough for a first question.
  if (data.chats.length === 0) return null;

  const shown = all ? data.chats : data.chats.slice(0, FIRST);

  return (
    <section aria-label="Recent chats">
      {heading}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.base, ease: ease.out, delay: 0.1 }}
        className="mt-3 space-y-5"
      >
        {byDay(shown, now, timeZone).map((group) => (
          <div key={group.label}>
            <h3 className="text-ink-3 mb-2 text-xs font-medium">{group.label}</h3>
            <ul className="rounded-card border-line-soft bg-paper divide-line-soft divide-y overflow-hidden border">
              {group.chats.map((chat) => (
                <ChatRow
                  key={chat.id}
                  chat={chat}
                  href={chatHref(shopId, chat.id)}
                  time={timeAgo(chat.updatedAt, now, timeZone)}
                  onRename={() => setRenaming(chat)}
                  onCopyLink={() => void copyLink(chat)}
                  onDelete={() => setDeleting(chat)}
                />
              ))}
            </ul>
          </div>
        ))}
      </motion.div>
      {data.chats.length > FIRST && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="text-moss-deep mt-4 text-[13px] font-medium hover:underline"
        >
          {all ? "Show fewer" : `Show all ${data.chats.length}`}
        </button>
      )}

      <RenameDialog chat={renaming} onClose={() => setRenaming(null)} />

      <Dialog
        open={deleting !== null}
        onClose={() => {
          if (!busy) setDeleting(null);
        }}
        title="Delete this chat?"
        description={
          deleting
            ? `"${deleting.title}" and everything in it is removed. This can't be undone.`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setDeleting(null)}
              disabled={busy}
              data-autofocus
            >
              Keep it
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={busy}>
              Delete
            </Button>
          </>
        }
      />
    </section>
  );
}

/** One chat: its card opens it; the button on its right opens its menu. */
function ChatRow({
  chat,
  href,
  time,
  onRename,
  onCopyLink,
  onDelete,
}: {
  chat: ChatSummary;
  href: string;
  time: string;
  onRename: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
}) {
  const control = usePopover();
  const pick = (action: () => void) => () => {
    control.hide();
    action();
  };
  return (
    <li className="group relative">
      <Link
        href={href}
        onClick={followChatLink}
        className="hover:bg-paper-hover block py-3 pr-14 pl-4 transition-colors focus-visible:-outline-offset-2"
      >
        <span className="text-ink block truncate text-sm font-medium">{chat.title}</span>
        <span className="text-ink-3 mt-0.5 block text-xs tabular-nums">{time}</span>
      </Link>
      <button
        {...triggerProps(control, "menu")}
        aria-label={`More for "${chat.title}"`}
        className={cn(
          "rounded-btn text-ink-3 hover:bg-wash hover:text-ink absolute top-1/2 right-2.5 flex size-8 -translate-y-1/2 items-center justify-center transition-colors",
          control.open && "bg-wash text-ink",
        )}
      >
        <MoreHorizontal className="size-4" />
      </button>
      <Popover
        control={control}
        kind="menu"
        label="Chat actions"
        placement="bottom-end"
        width={200}
        room={180}
      >
        <div className="p-1.5">
          <MenuButton onClick={pick(() => window.open(href, "_blank", "noopener"))}>
            Open in a new tab
          </MenuButton>
          <MenuButton onClick={pick(onRename)}>Rename</MenuButton>
          <MenuButton onClick={pick(onCopyLink)}>Copy link</MenuButton>
          <MenuDivider />
          <MenuButton onClick={pick(onDelete)} className="text-risk-700">
            Delete
          </MenuButton>
        </div>
      </Popover>
    </li>
  );
}

/** Renaming a chat: its current name, ready to change. */
function RenameDialog({ chat, onClose }: { chat: ChatSummary | null; onClose: () => void }) {
  const shopId = useShopId();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<string | null>(null);

  // A new chat to rename starts from its current name.
  if (chat && chat.id !== seen) {
    setSeen(chat.id);
    setTitle(chat.title);
    setError(undefined);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chat || busy) return;
    const next = title.replace(/\s+/g, " ").trim();
    if (!next) {
      setError("Give the chat a name.");
      return;
    }
    if (next === chat.title) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await renameChat(shopId, chat.id, next);
      onClose();
    } catch (e) {
      toast({ title: "Couldn't rename the chat", description: errorMessage(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={chat !== null}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Rename this chat"
      size="sm"
    >
      <form onSubmit={save} noValidate className="space-y-5">
        <FormField id="chat-title" label="Name" error={error}>
          {(control) => (
            <Input
              {...control}
              data-autofocus
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (error) setError(undefined);
              }}
              maxLength={80}
              disabled={busy}
            />
          )}
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
