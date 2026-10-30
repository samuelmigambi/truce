"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";
import {
  readThemeChoice,
  setThemeChoice,
  subscribeThemeChoice,
  type ThemeChoice,
} from "@/lib/theme";
import { cn } from "./cn";

const CHOICES: { value: ThemeChoice; label: string; icon: ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun /> },
  { value: "dark", label: "Dark", icon: <Moon /> },
  { value: "system", label: "Same as device", icon: <Monitor /> },
];

/** The theme's choice, read from storage in the browser; the server renders "system". */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribeThemeChoice, readThemeChoice, () => "system");
}

/**
 * Light, dark, or the device's own, as a row inside an account menu. The three are menu radio
 * items, so the arrow keys reach them, and choosing one keeps the menu open to see the change.
 */
export function ThemeMenuRow() {
  const choice = useThemeChoice();
  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex items-center justify-between gap-3 px-2.5 py-1.5"
    >
      <span className="text-ink text-[13.5px]">Theme</span>
      <div className="rounded-btn bg-ink/[0.05] flex items-center gap-0.5 p-[3px]">
        {CHOICES.map((option) => {
          const checked = choice === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={checked}
              aria-label={option.label}
              title={option.label}
              onClick={() => setThemeChoice(option.value)}
              className={cn(
                "flex size-7 items-center justify-center rounded-[8px] transition-colors outline-none [&_svg]:size-3.5",
                "focus-visible:ring-moss focus-visible:ring-2",
                checked
                  ? "bg-paper text-ink shadow-[0_1px_2px_rgb(30_38_20/0.08)]"
                  : "text-ink-3 hover:text-ink",
              )}
            >
              {option.icon}
            </button>
          );
        })}
      </div>
    </div>
  );
}
