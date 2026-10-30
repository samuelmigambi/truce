import Link from "next/link";
import { CasePreview } from "@/components/landing/case-preview";
import { HeroHighlight, Reveal, Rise } from "@/components/landing/reveal";
import { SiteHeader } from "@/components/landing/site-header";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Logo } from "@/components/ui/logo";

/** What a dispute can cost a small shop, in three numbers. */
const STAKES = [
  { figure: "$15", line: "The fee PayPal keeps when you lose a claim, on top of the refund." },
  {
    figure: "1.5%",
    line: "The claims ratio line. Past it, every claim costs $30, even the ones you win.",
  },
  { figure: "10 days", line: "To answer a claim. Miss it, and the buyer usually wins." },
];

/** How a case moves through Truce, ending with the seller. */
const STEPS = [
  {
    title: "It reads the case",
    body: "The dispute, the payment, tracking, your policies and every message, gathered for you.",
  },
  {
    title: "It weighs every move",
    body: "Fight, settle or refund, by what each would really cost you, fees and ratio included.",
  },
  {
    title: "You approve the reply",
    body: "A draft checked sentence by sentence against the evidence. Nothing is sent until you say so.",
  },
];

const container = "mx-auto w-full max-w-[1200px] px-5 sm:px-8";
const heading =
  "text-ink text-[34px] leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-[46px]";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <SiteHeader />

      <main className="flex-1">
        {/* The promise, and the product doing it */}
        <section className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-[-180px] h-[720px] bg-[radial-gradient(55%_50%_at_78%_42%,color-mix(in_oklab,var(--color-mist)_85%,transparent),transparent_72%)]"
          />
          <div
            className={`${container} relative grid items-center gap-14 pt-14 pb-24 sm:pt-20 lg:grid-cols-[1fr_1.02fr] lg:gap-16 lg:pt-24 lg:pb-32`}
          >
            <div>
              <Rise>
                <h1 className="text-ink text-[44px] leading-[1.04] font-semibold tracking-[-0.035em] sm:text-[60px] lg:text-[56px] xl:text-[64px]">
                  Win the disputes <br className="max-sm:hidden" />
                  you <HeroHighlight>should win.</HeroHighlight> <br className="max-sm:hidden" />
                  Settle the rest.
                </h1>
              </Rise>
              <Rise delay={0.06}>
                <p className="text-ink-2 mt-7 max-w-[500px] text-[18px] leading-relaxed text-pretty sm:text-[19px]">
                  Truce reads every PayPal dispute, works out what each move would cost, and drafts
                  a reply checked against the evidence. You approve every step.
                </p>
              </Rise>
              <Rise delay={0.12}>
                <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                  <ButtonLink href="/signup" size="lg">
                    Get started free
                  </ButtonLink>
                  <ButtonLink href="/shop" size="lg" variant="secondary">
                    See the demo shop
                  </ButtonLink>
                </div>
              </Rise>
            </div>
            <Rise delay={0.1}>
              <CasePreview className="mx-auto w-full max-w-[540px]" />
            </Rise>
          </div>
        </section>

        {/* Why it matters */}
        <section className={`${container} py-24 sm:py-32`}>
          <Reveal>
            <h2 className={cn(heading, "max-w-[640px]")}>
              A dispute can cost more than the order.
            </h2>
          </Reveal>
          <dl className="divide-line mt-14 grid gap-12 sm:mt-16 sm:grid-cols-3 sm:gap-0 sm:divide-x">
            {STAKES.map((s, i) => (
              <Reveal
                key={s.figure}
                delay={i * 0.08}
                className="sm:px-8 sm:first:pl-0 sm:last:pr-0"
              >
                <dt className="text-ink text-[56px] leading-none font-semibold tracking-[-0.04em] tabular-nums sm:text-[64px]">
                  {s.figure}
                </dt>
                <dd className="text-ink-2 mt-5 max-w-[300px] text-[17px] leading-relaxed text-pretty">
                  {s.line}
                </dd>
              </Reveal>
            ))}
          </dl>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-line-soft bg-paper scroll-mt-16 border-y">
          <div className={`${container} py-24 sm:py-32`}>
            <Reveal>
              <h2 className={cn(heading, "max-w-[640px]")}>
                From dispute to done, in three steps.
              </h2>
            </Reveal>
            <ol className="mt-14 grid gap-12 sm:mt-16 md:grid-cols-3 md:gap-10">
              {STEPS.map((step, i) => {
                const you = i === STEPS.length - 1;
                return (
                  <li key={step.title}>
                    <Reveal delay={i * 0.08}>
                      <span
                        className={cn(
                          "flex size-12 items-center justify-center rounded-[14px] text-[18px] font-semibold tabular-nums",
                          // The last step is the seller's: dark green in either theme.
                          you
                            ? "bg-forest text-lemon dark:ring-lemon/30 dark:ring-1"
                            : "bg-lemon text-on-lemon",
                        )}
                      >
                        {i + 1}
                      </span>
                      <h3 className="text-ink mt-7 text-[22px] font-semibold tracking-[-0.015em]">
                        {step.title}
                      </h3>
                      <p className="text-ink-2 mt-3 max-w-[340px] text-[17px] leading-relaxed text-pretty">
                        {step.body}
                      </p>
                    </Reveal>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* Pricing, and the way in */}
        <section id="pricing" className="scroll-mt-16 px-5 py-24 sm:px-8 sm:py-32">
          <Reveal className="bg-forest text-chalk relative mx-auto max-w-[1200px] overflow-hidden rounded-[28px] px-7 py-16 text-center sm:px-16 sm:py-24">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-48 left-1/2 size-[560px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(221_235_148/0.2),transparent_65%)]"
            />
            <div className="relative mx-auto max-w-[760px]">
              <h2 className="text-[36px] leading-[1.06] font-semibold tracking-[-0.03em] text-balance sm:text-[52px]">
                A flat price. Never a cut of what you win.
              </h2>
              <p className="text-chalk/75 mx-auto mt-6 max-w-[560px] text-[18px] leading-relaxed text-pretty">
                Truce costs the same whether you fight or refund, so it can tell you when refunding
                is the cheaper, fairer move. Free during the beta.
              </p>
              <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
                <ButtonLink href="/signup" size="lg" variant="lemon">
                  Get started free
                </ButtonLink>
                <ButtonLink href="/shop" size="lg" variant="inverse">
                  See the demo shop
                </ButtonLink>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-line-soft border-t">
        <div
          className={`${container} flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between`}
        >
          <Link href="/" aria-label="Truce home" className="w-fit rounded-md">
            <Logo className="h-7" />
          </Link>
          <nav aria-label="More" className="text-ink-2 flex flex-wrap gap-x-7 gap-y-2 text-[15px]">
            <Link className="hover:text-ink transition-colors" href="/signin">
              Sign in
            </Link>
            <Link className="hover:text-ink transition-colors" href="/shop">
              Demo shop
            </Link>
            <Link className="hover:text-ink transition-colors" href="/terms">
              Terms
            </Link>
            <Link className="hover:text-ink transition-colors" href="/privacy">
              Privacy
            </Link>
          </nav>
          <p className="text-ink-3 text-[15px]">© 2026 Truce</p>
        </div>
      </footer>
    </div>
  );
}
