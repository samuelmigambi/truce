"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { cn } from "./cn";
import { Input } from "./field";

/**
 * A password or secret field with a button that shows what's typed, so a long key can be checked
 * before it's sent. Edge's own reveal button is hidden, so there's only ever one.
 */
export function PasswordInput({
  className,
  revealLabel = "Show password",
  ...props
}: Omit<ComponentProps<"input">, "type"> & {
  /** Names the show button for screen readers; it says "pressed" while the text shows. */
  revealLabel?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input
        type={shown ? "text" : "password"}
        className={cn("pr-11 [&::-ms-clear]:hidden [&::-ms-reveal]:hidden", className)}
        {...props}
      />
      <button
        type="button"
        aria-label={revealLabel}
        aria-pressed={shown}
        aria-controls={props.id}
        disabled={props.disabled}
        onClick={() => setShown((value) => !value)}
        className="text-ink-3 hover:bg-wash hover:text-ink absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4"
      >
        {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
      </button>
    </div>
  );
}
