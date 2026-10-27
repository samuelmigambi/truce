import { ChevronDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

const control =
  "w-full rounded-btn border border-line bg-paper text-sm text-ink transition-[border-color,box-shadow] duration-150 " +
  "hover:border-line-strong focus:border-moss focus:shadow-[0_0_0_3px_rgb(92_117_36/0.14)] focus:outline-none " +
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

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(control, "h-10 appearance-none pr-9 pl-3", className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="text-ink-3 pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
      />
    </div>
  );
}

/** A label, the control, and a hint or error under it. */
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
      <label htmlFor={htmlFor} className="text-ink block text-[13px] font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-risk-700 text-[13px]">{error}</p>
      ) : hint ? (
        <p className="text-ink-2 text-[13px]">{hint}</p>
      ) : null}
    </div>
  );
}
