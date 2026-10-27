import { cn } from "./cn";

const TINTS = [
  "bg-mist text-moss-deep",
  "bg-[#efeee4] text-[#4f5444]",
  "bg-[#f4eedb] text-[#6b5a2c]",
  "bg-[#e7efe6] text-[#3e5a3c]",
  "bg-[#f0ebe3] text-[#665241]",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

function tint(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length] ?? TINTS[0]!;
}

/** A buyer's initials on a soft tint that stays the same for the same name. */
export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none",
        size === "sm" && "size-6 text-[10px]",
        size === "md" && "size-8 text-[11px]",
        size === "lg" && "size-10 text-[13px]",
        tint(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
