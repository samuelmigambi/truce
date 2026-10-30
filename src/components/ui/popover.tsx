"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { duration, ease } from "../motion";
import { cn } from "./cn";
import { Portal } from "./overlay";

/**
 * Panels that open from a button: the shop switcher, the user menu, notifications. Each sits in
 * a portal beside its button, flips to stay on screen, and closes on Escape or a click outside,
 * handing focus back to the button. Menus move between items with the arrow keys.
 */

export type Placement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  viewWidth: number;
  viewHeight: number;
}

function measure(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  return {
    top: r.top,
    bottom: r.bottom,
    left: r.left,
    right: r.right,
    width: r.width,
    viewWidth: window.innerWidth,
    viewHeight: window.innerHeight,
  };
}

export interface PopoverControl {
  anchor: RefObject<HTMLButtonElement | null>;
  open: boolean;
  box: Box | null;
  id: string;
  show: () => void;
  hide: (options?: { restoreFocus?: boolean }) => void;
  toggle: () => void;
}

/** The open state of one popover, and where its button is on screen. */
export function usePopover(): PopoverControl {
  const anchor = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const id = useId();
  const open = box !== null;

  const show = useCallback(() => {
    if (anchor.current) setBox(measure(anchor.current));
  }, []);
  const hide = useCallback((options?: { restoreFocus?: boolean }) => {
    setBox(null);
    if (options?.restoreFocus) anchor.current?.focus({ preventScroll: true });
  }, []);
  const toggle = useCallback(() => {
    if (open) hide();
    else show();
  }, [open, hide, show]);

  // While open, the panel follows its button through scrolling and resizing.
  useEffect(() => {
    if (!open) return;
    const follow = () => {
      const el = anchor.current;
      if (!el) return;
      const next = measure(el);
      // Closed meanwhile: stay closed. Unmoved: keep the same box, so nothing re-renders.
      setBox((current) =>
        !current || (Object.keys(next) as (keyof Box)[]).every((k) => current[k] === next[k])
          ? current
          : next,
      );
    };
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    return () => {
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
    };
  }, [open]);

  return { anchor, open, box, id, show, hide, toggle };
}

/** Props for the button that opens a popover. */
export function triggerProps(control: PopoverControl, kind: "menu" | "dialog") {
  return {
    ref: control.anchor,
    type: "button" as const,
    "aria-haspopup": kind,
    "aria-expanded": control.open,
    "aria-controls": control.open ? control.id : undefined,
    onClick: control.toggle,
  };
}

const GAP = 6;
const MARGIN = 8;
const ROOM = 280;

function position(
  box: Box,
  placement: Placement,
  width: number | "anchor",
  room = ROOM,
): CSSProperties {
  const w = Math.min(width === "anchor" ? box.width : width, box.viewWidth - MARGIN * 2);
  const wantsBelow = placement.startsWith("bottom");
  const below = box.viewHeight - box.bottom - GAP - MARGIN;
  const above = box.top - GAP - MARGIN;
  const down = wantsBelow ? below >= room || below >= above : !(above >= room || above >= below);
  const start = placement.endsWith("start") ? box.left : box.right - w;
  const left = Math.min(Math.max(start, MARGIN), box.viewWidth - w - MARGIN);
  return down
    ? { left, width: w, top: box.bottom + GAP, maxHeight: below }
    : { left, width: w, bottom: box.viewHeight - box.top + GAP, maxHeight: above };
}

const ITEM =
  ':is([role="menuitem"], [role="menuitemradio"]):not([aria-disabled="true"]):not([disabled])';

export function Popover({
  control,
  kind,
  label,
  placement = "bottom-start",
  width = 300,
  room,
  className,
  children,
}: {
  control: PopoverControl;
  /** A menu of actions, or a panel of content such as notifications. */
  kind: "menu" | "dialog";
  /** Names the panel for screen readers. */
  label: string;
  placement?: Placement;
  /** Pixels, or the button's own width. */
  width?: number | "anchor";
  /** The space it needs on its preferred side before it flips; a short menu needs less. */
  room?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Portal>
      <AnimatePresence>
        {control.box && (
          <Panel
            control={control}
            box={control.box}
            kind={kind}
            label={label}
            placement={placement}
            width={width}
            room={room}
            className={className}
          >
            {children}
          </Panel>
        )}
      </AnimatePresence>
    </Portal>
  );
}

function Panel({
  control,
  box,
  kind,
  label,
  placement,
  width,
  room,
  className,
  children,
}: {
  control: PopoverControl;
  box: Box;
  kind: "menu" | "dialog";
  label: string;
  placement: Placement;
  width: number | "anchor";
  room?: number;
  className?: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const { anchor, hide } = control;
  const style = position(box, placement, width, room);
  const down = style.top !== undefined;

  // Focus moves in as it opens: to the first item of a menu, or to the panel itself.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const target =
        kind === "menu" ? panel.current?.querySelector<HTMLElement>(ITEM) : panel.current;
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [kind]);

  // A press anywhere else closes it.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target || panel.current?.contains(target) || anchor.current?.contains(target)) return;
      hide();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [anchor, hide]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      // Only this panel closes, not a sheet or dialog it was opened from.
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      hide({ restoreFocus: true });
      return;
    }
    if (kind !== "menu") return;
    if (event.key === "Tab") {
      event.preventDefault();
      hide({ restoreFocus: true });
      return;
    }
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>(ITEM) ?? []);
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown"
        ? (index + 1) % items.length
        : event.key === "ArrowUp"
          ? (index - 1 + items.length) % items.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    items[next]?.focus();
  }

  return (
    <motion.div
      ref={panel}
      id={control.id}
      role={kind}
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{
        ...style,
        transformOrigin: `${placement.endsWith("start") ? "left" : "right"} ${down ? "top" : "bottom"}`,
      }}
      initial={{ opacity: 0, y: down ? -4 : 4, scale: 0.98 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: duration.base, ease: ease.out },
      }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: duration.instant, ease: ease.in } }}
      className={cn(
        "rounded-panel border-line bg-paper shadow-pop fixed z-[60] flex flex-col overflow-hidden border outline-none",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

const itemClass =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] text-ink transition-colors outline-none " +
  "hover:bg-wash focus-visible:bg-wash focus-visible:outline-none aria-disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-ink-3";

/** A menu item that goes somewhere. */
export function MenuLink({
  className,
  onSelect,
  onClick,
  ...props
}: ComponentProps<typeof Link> & { onSelect?: () => void }) {
  return (
    <Link
      role="menuitem"
      className={cn(itemClass, className)}
      onClick={(event) => {
        onClick?.(event);
        onSelect?.();
      }}
      {...props}
    />
  );
}

/** A menu item that does something. */
export function MenuButton({ className, type = "button", ...props }: ComponentProps<"button">) {
  return <button role="menuitem" type={type} className={cn(itemClass, className)} {...props} />;
}

export function MenuDivider() {
  return <div role="separator" className="bg-line-soft mx-2 my-1 h-px" />;
}

/** A quiet heading over a group of items. */
export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="text-ink-3 px-2.5 pt-2 pb-1 text-xs font-medium">{children}</p>;
}
