import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = { title: "Page not found" };

/** Any address that isn't a page, including a shop the person isn't part of. */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-[1200px] items-center px-5 sm:px-8">
        <Link href="/" aria-label="Truce home" className="rounded-md">
          <Logo className="h-8" />
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <p className="text-moss text-sm font-medium">Page not found</p>
        <h1 className="text-ink mt-3 text-[34px] leading-tight font-semibold tracking-[-0.025em] text-balance sm:text-[44px]">
          There&rsquo;s nothing to settle here
        </h1>
        <p className="text-ink-2 mt-4 max-w-md text-[17px] leading-relaxed text-pretty">
          The page may have moved, or the link was mistyped. Your shops and their cases are where
          you left them.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/app" size="lg">
            Back to your shops
          </ButtonLink>
          <ButtonLink href="/" size="lg" variant="secondary">
            Truce home
          </ButtonLink>
        </div>
      </main>
    </div>
  );
}
