"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, CircleAlert, RotateCcw, Square } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  NEW_CHAT,
  openChat,
  sendChat,
  startNewChat,
  stopChat,
  useChatThread,
  type ChatMessage,
  type ChatPart,
} from "@/lib/client/chat";
import { useShop } from "@/lib/client/shop-context";
import { duration, ease, spring } from "../../motion";
import { Button } from "../../ui/button";
import { cn } from "../../ui/cn";
import { LogoTile, ThinkingMark } from "../../ui/logo";
import { Spinner } from "../../ui/spinner";
import { ChatCardView } from "./chat-cards";
import { Greeting } from "./greeting";
import { Markdown } from "./markdown";

/** The sample shop's stories have answers worth asking for; a real shop starts general. */
const STARTERS = {
  sample: [
    "Which orders are at risk this week?",
    "Why did we lose the mug dispute?",
    "Refund Sam and say sorry",
  ],
  real: [
    "Which cases are due soonest?",
    "Sum up my open disputes",
    "What has cost me the most in fees?",
  ],
} as const;

/**
 * Ask Truce: a conversation about the shop's cases, orders and numbers. The input is the star;
 * answers stream in with a chip for each lookup, and cards for anything worth opening. Actions
 * come back as cards the seller approves; the chat never sends anything itself.
 *
 * On the page, the conversation scrolls with the page and the input stays pinned to the bottom
 * of the window. In the slide-over, the conversation scrolls inside the sheet.
 */
export function Chat({
  chatKey,
  caseId,
  variant = "page",
  initialDraft = "",
  draftNonce = 0,
  onNavigate,
  onSaved,
  onNewChat,
  below,
  topBar,
}: {
  /** Which chat: a saved chat's ID, or NEW_CHAT. */
  chatKey: string;
  caseId?: string | null;
  variant?: "page" | "sheet";
  initialDraft?: string;
  draftNonce?: number;
  onNavigate?: () => void;
  /** Hears a new chat's ID once the server has saved it. */
  onSaved?: (chatId: string) => void;
  /** Starts a fresh chat; the slide-over just empties itself by default. */
  onNewChat?: () => void;
  /** On the page, shown under the input until the first question: the recent chats. */
  below?: ReactNode;
  /** On the page, the bar over an open chat (history and a new chat). */
  topBar?: ReactNode;
}) {
  const shop = useShop();
  const thread = useChatThread(shop.id, chatKey);
  const { messages, busy } = thread;
  const scroller = useRef<HTMLDivElement>(null);
  // Whether to follow the newest message down. A chat on the page opens at its start and stays
  // there; asking a question starts following, and scrolling up stops it. The slide-over always
  // opens at the newest message.
  const pinned = useRef(variant !== "page");
  const last = messages[messages.length - 1];
  const lastSize = last
    ? last.parts.length +
      (last.parts.at(-1)?.type === "text" ? (last.parts.at(-1) as { text: string }).text.length : 0)
    : 0;

  const ask = (text: string) => {
    pinned.current = true;
    sendChat(shop.id, chatKey, text, { caseId, onSaved });
  };
  const stop = () => stopChat(shop.id, chatKey);
  const newChat = onNewChat ?? (() => startNewChat(shop.id));

  // The page follows the answer down while the person is at the bottom; scrolling up stops it.
  useEffect(() => {
    if (variant !== "page") return;
    const onScroll = () => {
      const root = document.documentElement;
      pinned.current = root.scrollHeight - window.scrollY - window.innerHeight < 120;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [variant]);

  // Another chat starts the same way: at its start on the page, at its end in the slide-over. A
  // new chat getting its ID mid-answer is still the same conversation, so it keeps following.
  // This runs before the scroll below, so the chat being left doesn't pull the next one down.
  const shownKey = useRef(chatKey);
  useLayoutEffect(() => {
    if (shownKey.current === chatKey) return;
    const adopted = shownKey.current === NEW_CHAT && busy;
    if (!adopted) pinned.current = variant !== "page";
    shownKey.current = chatKey;
  }, [chatKey, variant, busy]);

  useLayoutEffect(() => {
    if (!pinned.current) return;
    if (variant === "page") {
      window.scrollTo({ top: document.documentElement.scrollHeight });
    } else if (scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
  }, [variant, messages.length, lastSize]);

  const empty = messages.length === 0;
  const general: readonly string[] = STARTERS[shop.kind];
  const starters = caseId ? ["Sum up this case in two lines", ...general.slice(0, 2)] : general;
  // The page fills the window below the top bar and any strips above it, never more.
  const pageHeight =
    "min-h-[calc(100dvh-var(--app-top,0px)-var(--app-banner,0px)-var(--app-frame,0px))]";

  // A saved chat named in the address shows as loading until it's read, never as a new chat.
  const opening = chatKey !== NEW_CHAT && thread.chatId === null && !busy;
  if (thread.status === "loading" || opening) {
    const spinner = <Spinner className="text-ink-3 size-5" label="Opening the chat" />;
    if (variant !== "page") {
      return <div className="flex h-full items-center justify-center">{spinner}</div>;
    }
    return (
      <div className={cn("flex flex-col", pageHeight)}>
        {topBar}
        <div className="flex flex-1 items-center justify-center pb-[10vh]">{spinner}</div>
      </div>
    );
  }

  if (thread.status === "missing" || thread.status === "error") {
    return (
      <div className={cn("flex flex-col", variant === "page" ? pageHeight : "h-full")}>
        {variant === "page" && topBar}
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-[10vh] text-center">
          <p className="text-ink text-[15px] font-semibold">
            {thread.status === "missing"
              ? "This chat isn't there any more"
              : "This chat didn't open"}
          </p>
          <p className="text-ink-2 mt-1 max-w-sm text-sm">
            {thread.status === "missing"
              ? "It may have been deleted. Start a new one, or pick another from your recent chats."
              : "Check your connection and try again, or start a new chat."}
          </p>
          <div className="mt-5 flex gap-2">
            {thread.status === "error" && thread.chatId && (
              <Button variant="secondary" onClick={() => openChat(shop.id, thread.chatId!)}>
                Try again
              </Button>
            )}
            <Button onClick={newChat}>Start a new chat</Button>
          </div>
        </div>
      </div>
    );
  }

  // On its own page with nothing asked yet, the input sits front and center: in the middle on its
  // own, or near the top with the recent chats under it.
  if (variant === "page" && empty) {
    return (
      <div
        className={cn(
          "flex flex-col items-center px-4 sm:px-6",
          pageHeight,
          below ? "pt-[14vh] pb-12" : "justify-center pb-[10vh]",
        )}
      >
        <Welcome variant="page" starters={[]} caseId={caseId} onAsk={ask} />
        <div className="mt-8 w-full max-w-[720px]">
          <Composer
            caseId={caseId}
            busy={busy}
            variant="hero"
            canClear={false}
            initialDraft={initialDraft}
            draftNonce={draftNonce}
            onAsk={ask}
            onStop={stop}
            onNewChat={newChat}
          />
        </div>
        <Starters starters={starters} onAsk={ask} />
        {below && <div className="mt-14 w-full max-w-[760px]">{below}</div>}
      </div>
    );
  }

  const conversation = empty ? (
    <Welcome variant={variant} starters={starters} caseId={caseId} onAsk={ask} />
  ) : (
    <ol className="space-y-7">
      {messages.map((m) => (
        <li key={m.id}>
          {m.role === "user" ? (
            <UserMessage message={m} />
          ) : (
            <AssistantMessage message={m} onNavigate={onNavigate} />
          )}
        </li>
      ))}
    </ol>
  );

  const composer = (
    <div>
      <Composer
        caseId={caseId}
        busy={busy}
        variant={variant}
        canClear={!empty && variant === "sheet"}
        initialDraft={initialDraft}
        draftNonce={draftNonce}
        onAsk={ask}
        onStop={stop}
        onNewChat={newChat}
      />
    </div>
  );

  if (variant === "page") {
    return (
      <div className={cn("flex flex-col", pageHeight)}>
        {topBar}
        <div className="mx-auto w-full max-w-[760px] flex-1 px-4 pt-4 pb-6 sm:px-6">
          {conversation}
        </div>
        {/* Pinned to the bottom of the window, over a fade so the words slide under it. */}
        <div className="from-cream via-cream sticky bottom-[calc(var(--app-gutter,0px)+1px)] z-10 bg-gradient-to-t from-60% to-transparent pt-6">
          {composer}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full px-5 pt-5 pb-4">{conversation}</div>
      </div>
      {composer}
    </div>
  );
}

function Starters({
  starters,
  onAsk,
}: {
  starters: readonly string[];
  onAsk: (text: string) => void;
}) {
  return (
    <div className="mt-5 flex max-w-[720px] flex-wrap justify-center gap-2">
      {starters.map((s, i) => (
        <motion.button
          key={s}
          type="button"
          onClick={() => onAsk(s)}
          initial={{ opacity: 0, y: 6 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: { delay: 0.15 + i * 0.05, duration: duration.base, ease: ease.out },
          }}
          className="border-line-soft bg-paper text-ink-2 hover:border-line-strong hover:text-ink rounded-btn border px-3.5 py-2 text-[13px] transition-colors"
        >
          {s}
        </motion.button>
      ))}
    </div>
  );
}

function Welcome({
  variant,
  starters,
  caseId,
  onAsk,
}: {
  variant: "page" | "sheet";
  starters: readonly string[];
  caseId?: string | null;
  onAsk: (text: string) => void;
}) {
  const shop = useShop();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.slow, ease: ease.out }}
      className={cn("flex flex-col", variant === "page" ? "items-center text-center" : "pt-2")}
    >
      <LogoTile className={variant === "page" ? "size-12" : "size-10"} />
      {variant === "page" ? (
        <div className="mt-5">
          {caseId ? (
            <h1 className="text-ink text-2xl font-semibold tracking-[-0.01em]">
              Ask about this case
            </h1>
          ) : (
            <Greeting />
          )}
        </div>
      ) : (
        <>
          <h2 className="text-ink mt-4 text-lg font-semibold tracking-[-0.01em]">
            {caseId ? "Ask about this case" : "Ask Truce"}
          </h2>
          <p className="text-ink-2 mt-1.5 text-sm leading-relaxed">
            Questions about {shop.name}&rsquo;s cases, orders and claims ratio, answered from the
            shop&rsquo;s own records. Anything Truce prepares waits for your approval.
          </p>
        </>
      )}
      {starters.length > 0 && (
        <div className={cn("mt-6 flex flex-wrap gap-2", variant === "page" && "justify-center")}>
          {starters.map((s, i) => (
            <motion.button
              key={s}
              type="button"
              onClick={() => onAsk(s)}
              initial={{ opacity: 0, y: 6 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { delay: 0.1 + i * 0.05, duration: duration.base, ease: ease.out },
              }}
              className="border-line-soft bg-paper text-ink-2 hover:border-line-strong hover:text-ink rounded-btn border px-3.5 py-2 text-left text-[13px] transition-colors"
            >
              {s}
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function UserMessage({ message }: { message: ChatMessage }) {
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base, ease: ease.out }}
      className="flex justify-end"
    >
      <p className="bg-mist text-ink max-w-[85%] rounded-[14px] px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap">
        {text}
      </p>
    </motion.div>
  );
}

function AssistantMessage({
  message,
  onNavigate,
}: {
  message: ChatMessage;
  onNavigate?: () => void;
}) {
  const waiting = message.streaming && message.parts.length === 0;
  return (
    <div className="flex gap-3">
      <div className="pt-0.5">
        {message.streaming ? <ThinkingMark className="size-7" /> : <LogoTile className="size-7" />}
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        {waiting && <p className="text-ink-3 pt-1 text-sm">Thinking</p>}
        {groupParts(message.parts).map((group, i) =>
          group.kind === "tools" ? (
            <div key={i} className="flex flex-wrap gap-1.5">
              <AnimatePresence initial={false}>
                {group.parts.map((p) => (
                  <ToolChip key={p.id} part={p} />
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <PartView key={i} part={group.part} onNavigate={onNavigate} />
          ),
        )}
      </div>
    </div>
  );
}

type ToolPart = Extract<ChatPart, { type: "tool" }>;
type Group =
  { kind: "tools"; parts: ToolPart[] } | { kind: "part"; part: Exclude<ChatPart, ToolPart> };

/** Tool chips that run back to back sit on one line. */
function groupParts(parts: ChatPart[]): Group[] {
  const groups: Group[] = [];
  for (const part of parts) {
    if (part.type === "tool") {
      const prev = groups[groups.length - 1];
      if (prev?.kind === "tools") prev.parts.push(part);
      else groups.push({ kind: "tools", parts: [part] });
    } else {
      groups.push({ kind: "part", part });
    }
  }
  return groups;
}

function ToolChip({ part }: { part: ToolPart }) {
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.8, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={spring.pop}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-[8px] border px-2.5 text-xs font-medium",
        part.state === "running" && "shimmer shimmer-lemon border-line bg-paper text-ink-2",
        part.state === "done" && "border-line-soft bg-ink/[0.04] text-ink-2",
        part.state === "error" && "border-risk-200 bg-risk-50 text-risk-700",
      )}
    >
      {part.state === "running" ? (
        <Spinner className="size-3" />
      ) : part.state === "done" ? (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={spring.pop}
          className="flex"
        >
          <Check className="text-moss size-3" strokeWidth={3} />
        </motion.span>
      ) : (
        <CircleAlert className="size-3" />
      )}
      {part.label}
    </motion.span>
  );
}

function PartView({
  part,
  onNavigate,
}: {
  part: Exclude<ChatPart, ToolPart>;
  onNavigate?: () => void;
}) {
  if (part.type === "text") return <Markdown text={part.text} />;
  if (part.type === "card") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: duration.base, ease: ease.out }}
      >
        <ChatCardView card={part.card} onNavigate={onNavigate} />
      </motion.div>
    );
  }
  return (
    <p
      role="alert"
      className="rounded-card border-risk-200 bg-risk-50 text-risk-700 flex items-start gap-2 border px-3.5 py-2.5 text-[13px]"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      {part.message}
    </p>
  );
}

function Composer({
  caseId,
  busy,
  variant,
  canClear,
  initialDraft,
  draftNonce,
  onAsk,
  onStop,
  onNewChat,
}: {
  caseId?: string | null;
  busy: boolean;
  variant: "page" | "sheet" | "hero";
  canClear: boolean;
  initialDraft: string;
  draftNonce: number;
  onAsk: (text: string) => void;
  onStop: () => void;
  onNewChat: () => void;
}) {
  const [text, setText] = useState(initialDraft);
  const [seenNonce, setSeenNonce] = useState(draftNonce);
  const input = useRef<HTMLTextAreaElement>(null);

  // A new prefilled question from "Ask about this" replaces what's in the box.
  if (draftNonce !== seenNonce) {
    setSeenNonce(draftNonce);
    setText(initialDraft);
  }

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  // The cursor goes after any words put in the box, ready to add to them or send.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [draftNonce]);

  function submit() {
    if (busy) return;
    // The send button always looks ready; with nothing typed it just puts the cursor in the box.
    if (!text.trim()) {
      input.current?.focus();
      return;
    }
    onAsk(text);
    setText("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div
      className={cn(
        "shrink-0",
        variant === "page" && "pb-5",
        variant === "sheet" && "border-line-soft border-t px-4 pt-3 pb-4",
      )}
    >
      {/* On the page, the same box as the conversation, so the input lines up with it exactly. */}
      <div className={cn("mx-auto w-full", variant === "page" && "max-w-[760px] px-4 sm:px-6")}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className={cn(
            "group border-line bg-paper relative rounded-[16px] border transition-[border-color,box-shadow] duration-150",
            "hover:border-line-strong hover:shadow-[0_0_0_0.5px_var(--color-line-strong)]",
            "focus-within:border-moss focus-within:hover:border-moss focus-within:shadow-[0_0_0_0.5px_var(--color-moss)] focus-within:hover:shadow-[0_0_0_0.5px_var(--color-moss)]",
          )}
        >
          <label htmlFor={`ask-${variant}`} className="sr-only">
            Ask Truce
          </label>
          <textarea
            id={`ask-${variant}`}
            ref={input}
            // The slide-over puts the cursor here as it opens, ready for the question.
            data-autofocus={variant === "sheet" ? true : undefined}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              caseId ? "Ask about this case" : "Ask about a case, an order or your claims ratio"
            }
            className={cn(
              "text-ink block max-h-[180px] w-full resize-none bg-transparent px-4 pb-12 outline-none",
              variant === "hero"
                ? "min-h-[108px] pt-4 text-[16px] leading-relaxed"
                : "min-h-[76px] pt-3.5 text-[15px] leading-relaxed",
            )}
          />
          <div className="absolute inset-x-3 bottom-2.5 flex items-center justify-between">
            <div className="ml-auto flex items-center gap-1.5">
              {canClear && !busy && (
                <button
                  type="button"
                  onClick={onNewChat}
                  className="text-ink-2 hover:bg-wash hover:text-ink inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors [&_svg]:size-3.5"
                >
                  <RotateCcw />
                  New chat
                </button>
              )}
              {busy ? (
                <button
                  type="button"
                  onClick={onStop}
                  aria-label="Stop the answer"
                  className="bg-ink text-cream flex size-8 items-center justify-center rounded-full transition-transform active:scale-95"
                >
                  <Square className="size-3 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  aria-label="Send"
                  className="bg-lemon text-on-lemon hover:bg-lemon-deep flex size-8 items-center justify-center rounded-full transition-[transform,background-color] active:scale-95"
                >
                  <ArrowUp className="size-4" strokeWidth={2.4} />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
