"use client";

import { useEffect } from "react";

/**
 * The shop's fonts live in CSS variables on its layout. Drawers render in a portal on <body>, so
 * the variables go on <body> too while the shop is open.
 */
export function FontScope({ classes }: { classes: string }) {
  useEffect(() => {
    const names = classes.split(/\s+/).filter(Boolean);
    document.body.classList.add(...names);
    return () => document.body.classList.remove(...names);
  }, [classes]);
  return null;
}
