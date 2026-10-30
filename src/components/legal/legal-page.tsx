import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "../ui/logo";

export type LegalSection = { title: string; body: ReactNode };

/** A plain page of terms: the logo, a title, the date it last changed, and numbered sections. */
export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-line-soft border-b">
        <div className="mx-auto flex h-16 w-full max-w-[760px] items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="Truce home" className="rounded-md">
            <Logo className="h-7" />
          </Link>
          <nav aria-label="Legal" className="text-ink-2 flex gap-5 text-sm">
            <Link className="hover:text-ink" href="/terms">
              Terms
            </Link>
            <Link className="hover:text-ink" href="/privacy">
              Privacy
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[760px] flex-1 px-5 pt-12 pb-24 sm:px-8 sm:pt-16">
        <h1 className="text-ink text-[34px] leading-tight font-semibold tracking-[-0.025em] sm:text-[40px]">
          {title}
        </h1>
        <p className="text-ink-3 mt-2 text-sm">Last updated {updated}</p>
        <div className="text-ink-2 mt-6 text-[16px] leading-relaxed text-pretty">{intro}</div>

        <ol className="mt-12 space-y-10">
          {sections.map((section, index) => (
            <li key={section.title}>
              <h2 className="text-ink text-[19px] font-semibold tracking-[-0.01em]">
                {index + 1}. {section.title}
              </h2>
              <div className="text-ink-2 mt-3 space-y-3 text-[15px] leading-relaxed text-pretty [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
                {section.body}
              </div>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
