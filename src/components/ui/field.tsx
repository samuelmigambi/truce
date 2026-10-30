import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

const control =
  "w-full rounded-btn border border-line bg-paper text-sm text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] duration-150 " +
  "hover:border-line-strong hover:shadow-[0_0_0_0.5px_var(--color-line-strong)] focus:border-moss focus:shadow-[0_0_0_0.5px_var(--color-moss)] focus:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-risk-500";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-10 px-3", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(control, "min-h-24 px-3 py-2.5 leading-relaxed", className)}
      {...props}
    />
  );
}

/**
 * A label with any hint just under it, the control, and an error under the control. The error
 * has the id `${htmlFor}-note` and the hint `${htmlFor}-hint`, for the control's aria-describedby.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div>
        <label htmlFor={htmlFor} className="text-ink block text-[13px] font-[560]">
          {label}
        </label>
        {hint && (
          <p id={`${htmlFor}-hint`} className="text-ink-2 text-xs leading-[18px] font-[450]">
            {hint}
          </p>
        )}
      </div>
      {children}
      {error && (
        <p id={`${htmlFor}-note`} className="text-risk-700 text-[13px]">
          {error}
        </p>
      )}
    </div>
  );
}
