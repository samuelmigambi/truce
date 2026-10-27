"use client";

import type { ComponentProps } from "react";
import { warmUpDemo } from "@/lib/client/visit";
import { ButtonLink } from "../ui/button";

/** "Try the live demo": starts making the visitor's demo copy the moment they point at it. */
export function DemoLink(props: Omit<ComponentProps<typeof ButtonLink>, "href">) {
  return (
    <ButtonLink
      href="/app"
      onPointerEnter={warmUpDemo}
      onFocus={warmUpDemo}
      onTouchStart={warmUpDemo}
      {...props}
    />
  );
}
