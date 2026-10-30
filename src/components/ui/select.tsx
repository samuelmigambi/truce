"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "./cn";
import { Popover, triggerProps, usePopover } from "./popover";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

/** Lists longer than this get a search box. */
const SEARCH_FROM = 8;

/**
 * Truce's own dropdown, in place of the browser's: a button showing the choice, and a list that
 * opens under it. Arrow keys move through the list, Enter picks, Escape closes, and typing jumps
 * to a match. Long lists get a search box at the top.
 */
export function Select<T extends string>({
  id,
  value,
  onChange,
  options,
  placeholder = "Choose one",
  searchable = options.length > SEARCH_FROM,
  searchPlaceholder = "Search",
  disabled = false,
  readOnly = false,
  className,
  ...aria
}: {
  id?: string;
  value: T | null;
  onChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  placeholder?: string;
  /** On by default for long lists. */
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  /** Shows the choice as a fixed value that can't be changed. */
  readOnly?: boolean;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
}) {
  const control = usePopover();
  const listId = useId();
  const selected = options.find((option) => option.value === value) ?? null;

  function onTriggerKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      control.show();
    }
  }

  return (
    <>
      <button
        {...triggerProps(control, "dialog")}
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={control.open}
        aria-controls={listId}
        aria-describedby={aria["aria-describedby"]}
        aria-invalid={aria["aria-invalid"]}
        disabled={disabled || readOnly}
        aria-readonly={readOnly || undefined}
        onKeyDown={onTriggerKey}
        className={cn(
          "rounded-btn border-line text-ink flex h-10 w-full items-center gap-2 border pr-2.5 pl-3 text-left text-sm",
          "transition-[border-color,box-shadow] duration-150 outline-none",
          readOnly
            ? "bg-cream text-ink-2 cursor-default"
            : cn(
                "bg-paper hover:border-line-strong hover:shadow-[0_0_0_0.5px_var(--color-line-strong)]",
                "focus-visible:border-moss focus-visible:shadow-[0_0_0_0.5px_var(--color-moss)]",
                "aria-invalid:border-risk-500 disabled:cursor-not-allowed disabled:opacity-60",
              ),
          control.open && "border-moss shadow-[0_0_0_0.5px_var(--color-moss)]",
          className,
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", !selected && "text-ink-3")}>
          {selected?.label ?? placeholder}
        </span>
        {!readOnly && (
          <ChevronDown
            aria-hidden
            className={cn(
              "text-ink-3 size-4 shrink-0 transition-transform duration-150",
              control.open && "rotate-180",
            )}
          />
        )}
      </button>

      <Popover control={control} kind="dialog" label="Choose an option" width="anchor">
        <OptionList
          listId={listId}
          options={options}
          value={value}
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
          onPick={(next) => {
            onChange(next);
            control.hide({ restoreFocus: true });
          }}
          onLeave={() => control.hide({ restoreFocus: true })}
        />
      </Popover>
    </>
  );
}

function OptionList<T extends string>({
  listId,
  options,
  value,
  searchable,
  searchPlaceholder,
  onPick,
  onLeave,
}: {
  listId: string;
  options: readonly SelectOption<T>[];
  value: T | null;
  searchable: boolean;
  searchPlaceholder: string;
  onPick: (value: T) => void;
  onLeave: () => void;
}) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return options;
    return options.filter((option) => {
      const text = `${option.label} ${option.value}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
  }, [options, query]);
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      options.findIndex((option) => option.value === value),
    ),
  );
  const list = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const optionId = (index: number) => `${listId}-${index}`;
  const current = Math.min(active, shown.length - 1);

  // Focus goes to the search box, or to the list, once the panel is in place. Two frames, so it
  // lands after the panel's own focus on opening.
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() =>
        (searchable ? search.current : list.current)?.focus({ preventScroll: true }),
      );
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [searchable]);

  // The active option stays in view as it moves.
  useEffect(() => {
    if (current < 0) return;
    document.getElementById(optionId(current))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const last = shown.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(current + 1, last),
      ArrowUp: Math.max(current - 1, 0),
      Home: 0,
      End: last,
      PageDown: Math.min(current + 8, last),
      PageUp: Math.max(current - 8, 0),
    };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]!);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = shown[current];
      if (option) onPick(option.value);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      onLeave();
      return;
    }
    // Without a search box, typing jumps to the first option that starts with what was typed.
    if (!searchable && event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      const now = Date.now();
      const text = (now - typed.current.at < 700 ? typed.current.text : "") + event.key;
      typed.current = { text, at: now };
      const match = shown.findIndex((option) =>
        option.label.toLowerCase().startsWith(text.toLowerCase()),
      );
      if (match >= 0) setActive(match);
    }
  }

  return (
    <div onKeyDown={onKeyDown} className="flex min-h-0 flex-col">
      {searchable && (
        <div className="border-line-soft relative border-b p-1.5">
          <Search
            aria-hidden
            className="text-ink-3 pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
          />
          <input
            ref={search}
            type="text"
            role="searchbox"
            aria-controls={listId}
            aria-activedescendant={current >= 0 ? optionId(current) : undefined}
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            autoComplete="off"
            spellCheck={false}
            className="text-ink placeholder:text-ink-3 h-9 w-full rounded-lg bg-transparent pr-2.5 pl-8 text-sm outline-none"
          />
        </div>
      )}
      <ul
        ref={list}
        id={listId}
        role="listbox"
        tabIndex={searchable ? -1 : 0}
        aria-activedescendant={!searchable && current >= 0 ? optionId(current) : undefined}
        className="max-h-72 min-h-0 overflow-y-auto overscroll-contain p-1.5 outline-none"
      >
        {shown.length === 0 ? (
          <li className="text-ink-3 px-2.5 py-2 text-[13.5px]">No matches</li>
        ) : (
          shown.map((option, index) => (
            <OptionRow
              key={option.value}
              id={optionId(index)}
              selected={option.value === value}
              active={index === current}
              onHover={() => setActive(index)}
              onPick={() => onPick(option.value)}
            >
              {option.label}
            </OptionRow>
          ))
        )}
      </ul>
    </div>
  );
}

function OptionRow({
  id,
  selected,
  active,
  onHover,
  onPick,
  children,
}: {
  id: string;
  selected: boolean;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
  children: ReactNode;
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      onPointerMove={onHover}
      // Picking on pointer down keeps focus where it is until the list closes.
      onPointerDown={(event) => event.preventDefault()}
      onClick={onPick}
      className={cn(
        "text-ink flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-[13.5px] select-none",
        active && "bg-wash",
        selected && "font-medium",
      )}
    >
      {/* The tick's space is kept on every row, so the labels line up. */}
      <Check
        aria-hidden
        className={cn("text-moss size-4 shrink-0", !selected && "invisible")}
        strokeWidth={2.5}
      />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </li>
  );
}
