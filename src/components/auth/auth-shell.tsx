import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "../ui/logo";
import { BrandPanel } from "./brand-panel";

/**
 * The frame every sign-in page shares: a calm brand panel beside the form on wide screens, and
 * just the form under the logo on phones.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(440px,5fr)_7fr]">
      <BrandPanel />
      <div className="dark:bg-cream flex min-h-dvh min-w-0 flex-col bg-[color-mix(in_oklab,var(--color-cream),var(--color-mist)_35%)]">
        <header className="flex h-16 shrink-0 items-center px-4 sm:px-8 lg:hidden">
          <Link href="/" aria-label="Truce home" className="rounded-md">
            <Logo className="h-7" />
          </Link>
        </header>
        <main className="flex flex-1 justify-center px-4 pt-2 pb-16 sm:items-center sm:px-8 sm:py-16">
          <div className="animate-fade-rise w-full max-w-[400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** The white card a sign-in form sits on, with its title and a line under it. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <div className="rounded-panel border-line bg-paper border p-6 sm:p-8">
        <h1 className="text-ink text-[24px] leading-tight font-semibold tracking-[-0.02em]">
          {title}
        </h1>
        {description && (
          <p className="text-ink-2 mt-1.5 text-[15px] leading-relaxed text-pretty">{description}</p>
        )}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="text-ink-2 mt-5 text-center text-sm">{footer}</div>}
    </>
  );
}
