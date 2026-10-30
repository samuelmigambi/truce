/**
 * Light and dark: the person's choice ("system" follows the device) lives in localStorage, and
 * the theme in use sits on <html data-theme>, where globals.css swaps the color tokens. A small
 * script in the page's head applies it before anything paints, so no page flashes the wrong one.
 * The Wick & Ember storefront is a shop's own site, so it always stays light.
 */

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_KEY = "truce-theme";

declare global {
  interface Window {
    /** Set by the head script: applies the saved choice to the page again. */
    __truceTheme?: () => void;
  }
}

/** Runs in <head> before the body: applies the choice now, and again when the device switches. */
export const THEME_SCRIPT = `(function(){try{
var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");
function apply(){var c=null;try{c=localStorage.getItem("${THEME_KEY}")}catch(e){}
var p=location.pathname,shop=p==="/shop"||p.indexOf("/shop/")===0;
var dark=!shop&&(c==="dark"||(c!=="light"&&m.matches));
d.setAttribute("data-theme",dark?"dark":"light");}
apply();window.__truceTheme=apply;
m.addEventListener("change",apply);window.addEventListener("storage",apply);
}catch(e){}})();`;

export function readThemeChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

const listeners = new Set<() => void>();

export function setThemeChoice(choice: ThemeChoice) {
  let saved = true;
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    saved = false;
  }
  if (saved && window.__truceTheme) {
    window.__truceTheme();
  } else {
    // Storage can be off (a private window); the choice then lasts for this page only.
    const dark =
      choice === "dark" ||
      (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }
  for (const listener of listeners) listener();
}

/** For useSyncExternalStore: tells React when the choice changes, here or in another tab. */
export function subscribeThemeChoice(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
