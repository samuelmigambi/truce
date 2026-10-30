import type { ReactNode } from "react";
import { cn } from "./cn";

/** What a control needs to be tied to its label, hint and error. Spread it onto the input. */
export interface ControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

/**
 * A label with any hint just under it, the control, and an error under the control, wired
 * together so screen readers read the hint and the error with the control. The control comes
 * from a function that receives those ids, so any input, select or custom control can sit inside.
 */
export function FormField({
  id,
  label,
  hint,
  error,
  aside,
  optional = false,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Something small on the label's line, such as a link or a counter. */
  aside?: ReactNode;
  /** Adds "(optional)" to the label. */
  optional?: boolean;
  className?: string;
  children: (control: ControlProps) => ReactNode;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div>
        <div className="flex min-h-5 items-baseline justify-between gap-3">
          <label htmlFor={id} className="text-ink text-[13px] font-[560]">
            {label}
            {optional && " (optional)"}
          </label>
          {aside}
        </div>
        {hint && (
          <p id={hintId} className="text-ink-2 text-xs leading-[18px] font-[450] text-pretty">
            {hint}
          </p>
        )}
      </div>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {error && (
        <p id={errorId} className="text-risk-700 animate-fade-rise text-[13px] leading-5">
          {error}
        </p>
      )}
    </div>
  );
}
