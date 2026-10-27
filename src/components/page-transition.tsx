import type { ReactNode } from "react";
import { cn } from "./ui/cn";

/**
 * Each page fades and rises 8 px into place as it arrives. Plain CSS, so server-rendered pages
 * show up even before the JavaScript does, and reduced motion turns it off (globals.css).
 */
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("animate-fade-rise", className)}>{children}</div>;
}
