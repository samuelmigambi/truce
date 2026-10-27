import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

/** A raised white surface with a 1 px border. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-card border-line bg-paper border", className)} {...props} />;
}

/** A card's title row: a heading, an optional line under it, and actions on the right. */
export function CardHeader({
  title,
  description,
  actions,
  icon,
  className,
  as: Heading = "h2",
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-4 pb-3", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="text-ink-3 mt-0.5 [&_svg]:size-4">{icon}</span>}
        <div className="min-w-0">
          <Heading className="text-ink text-[15px] leading-6 font-semibold">{title}</Heading>
          {description && <p className="text-ink-2 mt-0.5 text-[13px] leading-5">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

/** A hairline between sections of a card. */
export function Divider({ className }: { className?: string }) {
  return <div role="separator" className={cn("bg-line-soft h-px", className)} />;
}
