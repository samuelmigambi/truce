import { cn } from "../../ui/cn";

const TINTS = [
  "bg-mist text-moss-deep",
  "bg-[#efeee4] text-[#4f5444] dark:bg-[#2f2f32] dark:text-[#d6d6d2]",
  "bg-[#f4eedb] text-[#6b5a2c] dark:bg-[#35302a] dark:text-[#e0cfa4]",
  "bg-[#e7efe6] text-[#3e5a3c] dark:bg-[#2b3030] dark:text-[#c3cfcc]",
  "bg-[#f0ebe3] text-[#665241] dark:bg-[#352e2c] dark:text-[#dbc6b8]",
];

function tint(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length] ?? TINTS[0]!;
}

/** A shop's first letter on a soft square tile, the same tint every time for the same name. */
export function ShopMark({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const first = /[\p{L}\p{N}]/u.exec(name);
  const letter = first ? first[0].toUpperCase() : "?";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-semibold select-none",
        size === "sm" ? "size-6 rounded-[7px] text-[11px]" : "size-8 rounded-[9px] text-[13px]",
        tint(name),
        className,
      )}
    >
      {letter}
    </span>
  );
}
