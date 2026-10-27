"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { DemoLink } from "./demo-link";
import { cn } from "../ui/cn";
import { Logo } from "../ui/logo";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#approve", label: "You approve" },
  { href: "#pricing", label: "Pricing" },
  { href: "/shop", label: "Demo shop" },
];

function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

/** The landing page's top bar. It picks up a hairline once the page scrolls. */
export function SiteHeader() {
  const scrolled = useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > 8,
    () => false,
  );
  const [open, setOpen] = useState(false);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,border-color] duration-200",
        scrolled || open
          ? "border-line-soft bg-cream/85 backdrop-blur-md"
          : "bg-cream/0 border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-6 px-5 sm:px-8">
        <Link href="/" aria-label="Truce home" className="rounded-md">
          <Logo className="h-8" />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-ink-2 hover:bg-wash hover:text-ink rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <DemoLink size="sm" trailing={<ArrowRight />} className="max-sm:hidden">
            Try the live demo
          </DemoLink>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
            className="rounded-btn text-ink hover:bg-wash flex size-9 items-center justify-center transition-colors md:hidden [&_svg]:size-5"
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="border-line-soft border-t px-5 pt-2 pb-4 md:hidden"
        >
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="text-ink block rounded-lg px-2 py-2.5 text-[15px] font-medium"
            >
              {l.label}
            </a>
          ))}
          <DemoLink className="mt-2 w-full" trailing={<ArrowRight />}>
            Try the live demo
          </DemoLink>
        </nav>
      )}
    </header>
  );
}
