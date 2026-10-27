import { fullModelName, modelTier, shortModelName, type ModelTier } from "@/lib/client/labels";
import { cn } from "./cn";

/** One color per model, the same everywhere: lemon for Lightning, moss for Super VL, ink for Ultra. */
export const TIER_SWATCH: Record<ModelTier, string> = {
  lightning: "bg-lemon ring-1 ring-inset ring-[#c6d66a]",
  super: "bg-moss",
  ultra: "bg-ink",
  embed: "bg-mist ring-1 ring-inset ring-moss/40",
  code: "bg-paper ring-1 ring-inset ring-ink/30 [background-image:repeating-linear-gradient(135deg,transparent_0_2px,rgb(30_38_20/0.18)_2px_3px)]",
  other: "bg-ink-3",
};

export function ModelSwatch({ tier, className }: { tier: ModelTier; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-[3px]", TIER_SWATCH[tier], className)}
    />
  );
}

/** The model behind a step: a swatch and its short name ("Ultra"), or "Plain code". */
export function ModelBadge({
  model,
  full = false,
  className,
}: {
  model: string | null | undefined;
  full?: boolean;
  className?: string;
}) {
  const tier = modelTier(model);
  return (
    <span
      title={model ?? "Plain code, no model"}
      className={cn(
        "text-ink-2 inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      <ModelSwatch tier={tier} />
      {full ? fullModelName(model) : shortModelName(model)}
    </span>
  );
}
