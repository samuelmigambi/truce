"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, CircleAlert, RotateCcw, Square } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  clearChat,
  sendChat,
  stopChat,
  useChat,
  type ChatMessage,
  type ChatPart,
} from "@/lib/client/chat";
import { formatCost } from "@/lib/client/format";
import { shortModelName } from "@/lib/client/labels";
import { duration, ease, spring } from "../../motion";
import { cn } from "../../ui/cn";
import { LogoTile, ThinkingMark } from "../../ui/logo";
import { Spinner } from "../../ui/spinner";
import { ChatCardView } from "./chat-cards";
import { Markdown } from "./markdown";

const STARTERS = [
  "Which orders are at risk this week?",
  "Why did we lose the mug dispute?",
  "Refund Sam and say sorry",
];

/**
 * Ask Truce: a conversation about the shop's cases, orders and numbers. The input is the star;
 * answers stream in with a chip for each lookup, and cards for anything worth opening. Actions
 * come back as cards the seller approves; the chat never sends anything itself.
 */
export function Chat({
  caseId,
  variant = "page",
  initialDraft = "",
  draftNonce = 0,
  onNavigate,
}: {
  caseId?: string | null;
  variant?: "page" | "sheet";
  initialDraft?: string;
  draftNonce?: number;
  onNavigate?: () => void;
}) {
  const { messages, busy } = useChat();
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const last = messages[messages.length - 1];
  const lastSize = last
    ? last.parts.length +
      (last.parts.at(-1)?.type === "text" ? (last.parts.at(-1) as { text: string }).text.length : 0)
    : 0;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastSize]);

  const empty = messages.length === 0;
  const starters = caseId ? ["Sum up this case in two lines", ...STARTERS.slice(0, 2)] : STARTERS;

  // On its own page with nothing asked yet, the input sits in the middle, front and center.
  if (variant === "page" && empty) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto px-4 pb-[10vh] sm:px-6">
        <Welcome variant="page" starters={[]} caseId={caseId} />
        <motion.div
          layoutId="ask-composer"
          transition={spring.layout}
          className="mt-8 w-full max-w-[720px]"
        >
          <Composer
            caseId={caseId}
            busy={busy}
            variant="hero"
            canClear={false}
            initialDraft={initialDraft}
            draftNonce={draftNonce}
          />
        </motion.div>
        <Starters starters={starters} caseId={caseId} />
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
        <div
          className={cn(
            "mx-auto w-full",
            variant === "page" ? "max-w-[760px] px-4 pt-8 pb-6 sm:px-6" : "px-5 pt-5 pb-4",
          )}
        >
          {empty ? (
            <Welcome variant={variant} starters={starters} caseId={caseId} />
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
          )}
        </div>
      </div>
      <motion.div
        layoutId={variant === "page" ? "ask-composer" : undefined}
        transition={spring.layout}
      >
        <Composer
          caseId={caseId}
          busy={busy}
          variant={variant}
          canClear={!empty}
          initialDraft={initialDraft}
          draftNonce={draftNonce}
        />
      </motion.div>
    </div>
  );
}

function Starters({ starters, caseId }: { starters: string[]; caseId?: string | null }) {
  return (
    <div className="mt-5 flex max-w-[720px] flex-wrap justify-center gap-2">
      {starters.map((s, i) => (
        <motion.button
          key={s}
          type="button"
          onClick={() => sendChat(s, caseId)}
          initial={{ opacity: 0, y: 6 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: { delay: 0.15 + i * 0.05, duration: duration.base, ease: ease.out },
          }}
          className="border-line bg-paper text-ink-2 hover:border-line-strong hover:text-ink rounded-full border px-3.5 py-2 text-[13px] transition-colors"
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
}: {
  variant: "page" | "sheet";
  starters: string[];
  caseId?: string | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.slow, ease: ease.out }}
      className={cn("flex flex-col", variant === "page" ? "items-center text-center" : "pt-2")}
    >
      <LogoTile className={variant === "page" ? "size-12" : "size-10"} />
      <h2
        className={cn(
          "text-ink mt-4 font-semibold tracking-[-0.01em]",
          variant === "page" ? "text-2xl" : "text-lg",
        )}
      >
        {caseId ? "Ask about this case" : "Ask Truce"}
      </h2>
      <p
        className={cn(
          "text-ink-2 mt-1.5 text-sm leading-relaxed",
          variant === "page" && "max-w-md",
        )}
      >
        Questions about your cases, orders and claims ratio, answered from your shop&rsquo;s
        records. Anything Truce prepares waits for your approval.
      </p>
      {starters.length > 0 && (
        <div className={cn("mt-6 flex flex-wrap gap-2", variant === "page" && "justify-center")}>
          {starters.map((s, i) => (
            <motion.button
              key={s}
              type="button"
              onClick={() => sendChat(s, caseId)}
              initial={{ opacity: 0, y: 6 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { delay: 0.1 + i * 0.05, duration: duration.base, ease: ease.out },
              }}
              className="border-line bg-paper text-ink-2 hover:border-line-strong hover:text-ink rounded-full border px-3.5 py-2 text-left text-[13px] transition-colors"
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
      <p className="bg-mist text-ink max-w-[85%] rounded-[16px] rounded-br-[5px] px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap">
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
        {!message.streaming && message.model && (
          <p className="text-ink-3 text-[11px]">
            {shortModelName(message.model)} · {formatCost(message.cost)}
          </p>
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
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
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
}: {
  caseId?: string | null;
  busy: boolean;
  variant: "page" | "sheet" | "hero";
  canClear: boolean;
  initialDraft: string;
  draftNonce: number;
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

  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, [draftNonce]);

  function submit() {
    if (!text.trim() || busy) return;
    sendChat(text, caseId);
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
        variant === "page" && "px-4 pb-5 sm:px-6",
        variant === "sheet" && "border-line-soft border-t px-4 pt-3 pb-4",
      )}
    >
      <div className={cn("mx-auto w-full", variant === "page" && "max-w-[760px]")}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="group border-line-strong bg-paper focus-within:border-moss relative rounded-[16px] border shadow-[0_1px_2px_rgb(30_38_20/0.04),0_8px_24px_-12px_rgb(30_38_20/0.12)] transition-[border-color,box-shadow] focus-within:shadow-[0_0_0_4px_rgb(92_117_36/0.12)]"
        >
          <label htmlFor={`ask-${variant}`} className="sr-only">
            Ask Truce
          </label>
          <textarea
            id={`ask-${variant}`}
            ref={input}
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
                ? "min-h-[88px] pt-4 text-[16px] leading-relaxed"
                : "pt-3.5 text-[15px] leading-relaxed",
            )}
          />
          <div className="absolute inset-x-3 bottom-2.5 flex items-center justify-between">
            <span className="text-ink-3 text-[11px] max-sm:hidden">
              Enter to send, Shift and Enter for a new line
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              {canClear && !busy && (
                <button
                  type="button"
                  onClick={clearChat}
                  className="text-ink-2 hover:bg-wash hover:text-ink inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors [&_svg]:size-3.5"
                >
                  <RotateCcw />
                  New chat
                </button>
              )}
              {busy ? (
                <button
                  type="button"
                  onClick={stopChat}
                  aria-label="Stop the answer"
                  className="bg-ink text-cream flex size-8 items-center justify-center rounded-full transition-transform active:scale-95"
                >
                  <Square className="size-3 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={!text.trim()}
                  className="bg-ink text-cream flex size-8 items-center justify-center rounded-full transition-[transform,opacity] active:scale-95 disabled:opacity-25"
                >
                  <ArrowUp className="size-4" strokeWidth={2.4} />
                </button>
              )}
            </div>
          </div>
        </form>
        {variant !== "hero" && (
          <p className="text-ink-3 mt-2 text-center text-[11px]">
            Truce prepares; you approve. It never sends anything on its own.
          </p>
        )}
      </div>
    </div>
  );
}
