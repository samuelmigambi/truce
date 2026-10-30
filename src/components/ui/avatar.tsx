import { cn } from "./cn";

const TINTS = [
  "bg-mist text-moss-deep",
  "bg-[#efeee4] text-[#4f5444] dark:bg-[#2f2f32] dark:text-[#d6d6d2]",
  "bg-[#f4eedb] text-[#6b5a2c] dark:bg-[#35302a] dark:text-[#e0cfa4]",
  "bg-[#e7efe6] text-[#3e5a3c] dark:bg-[#2b3030] dark:text-[#c3cfcc]",
  "bg-[#f0ebe3] text-[#665241] dark:bg-[#352e2c] dark:text-[#dbc6b8]",
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

/**
 * A person's initials on a soft tint that stays the same for the same name, or on Truce's own
 * lemon green for the signed-in person's avatar.
 */
export function Avatar({
  name,
  size = "md",
  tone = "soft",
  className,
}: {
  name: string;
  /** `account` is the signed-in person's avatar in a top bar. */
  size?: "sm" | "md" | "account" | "lg";
  tone?: "soft" | "brand";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none",
        size === "sm" && "size-6 text-[10px]",
        size === "md" && "size-8 text-[11px]",
        size === "account" && "size-9 text-[12px]",
        size === "lg" && "size-10 text-[13px]",
        tone === "brand"
          ? "text-moss-deep dark:text-lemon bg-[color-mix(in_oklab,var(--color-lemon),var(--color-mist)_45%)] dark:bg-[#2c2d27]"
          : tint(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
