"use client";

import { useEffect } from "react";

/**
 * Wick & Ember is a shop's own site, so it stays light whatever theme Truce is in. The head
 * script already starts it light; this keeps it light when the shop is reached from inside the
 * app, and hands the person's own theme back on the way out.
 */
export function LightOnly() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", "light");
    return () => window.__truceTheme?.();
  }, []);
  return null;
}
