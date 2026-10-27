import {
  ArrowRight,
  Calculator,
  Check,
  FileCheck2,
  PencilLine,
  ShieldCheck,
  Store,
} from "lucide-react";
import Link from "next/link";
import { CasePreview } from "@/components/landing/case-preview";
import { DemoLink } from "@/components/landing/demo-link";
import { HeroHighlight, Reveal, Rise } from "@/components/landing/reveal";
import { Numbers } from "@/components/landing/numbers";
import { Pipeline } from "@/components/landing/pipeline";
import { SiteHeader } from "@/components/landing/site-header";
import { VerifyMock } from "@/components/landing/verify-mock";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { ModelSwatch } from "@/components/ui/model-badge";

const MODELS = [
  {
    tier: "lightning" as const,
    name: "Nemotron 3.5 Lightning",
    role: "Sorts",
    body: "Reads every new case, sums it up, judges how urgent it is and gathers the records: the payment, tracking, the listing, your policies and the messages.",
  },
  {
    tier: "super" as const,
    name: "Nemotron 3.5 Super VL",
    role: "Drafts and reads photos",
    body: "Writes the reply to the buyer or the evidence for PayPal, looks at the buyer's photos, and answers your questions in Ask Truce.",
  },
  {
    tier: "ultra" as const,
    name: "Nemotron 3 Ultra",
    role: "Decides and checks",
    body: "Makes the fight, settle or refund call from costs worked out in code, then checks every sentence of the draft against the evidence.",
  },
];

const container = "mx-auto w-full max-w-[1200px] px-5 sm:px-8";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-[-160px] h-[640px] bg-[radial-gradient(60%_50%_at_75%_40%,rgb(241_246_210/0.9),transparent_70%)]"
          />
          <div
            className={`${container} relative grid items-center gap-12 pt-12 pb-20 sm:pt-16 lg:grid-cols-[1.02fr_1fr] lg:gap-16 lg:pt-20 lg:pb-28`}
          >
            <div>
              <Rise>
                <p className="border-line bg-paper/70 text-ink-2 inline-flex items-center gap-2 rounded-full border py-1 pr-3 pl-1.5 text-[13px] font-medium">
                  <span className="bg-lemon text-ink rounded-full px-2 py-0.5 text-xs">New</span>
                  PayPal disputes, handled for small shops
                </p>
              </Rise>
              <Rise delay={0.05}>
                <h1 className="text-ink mt-6 text-[40px] leading-[1.05] font-semibold tracking-[-0.032em] sm:text-[52px] lg:text-[46px] xl:text-[56px]">
                  Win the disputes <br className="hidden sm:inline" />
                  you <HeroHighlight>should win.</HeroHighlight> <br className="hidden sm:inline" />
                  Settle the rest before <br className="hidden sm:inline" />
                  they cost you.
                </h1>
              </Rise>
              <Rise delay={0.1}>
                <p className="text-ink-2 mt-6 max-w-[540px] text-[17px] leading-relaxed text-pretty sm:text-lg">
                  Truce reads each PayPal dispute, gathers the evidence and works out what fighting,
                  settling or refunding would cost. Then it drafts the reply and checks every
                  sentence. You approve every step.
                </p>
              </Rise>
              <Rise delay={0.15}>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <DemoLink size="lg" trailing={<ArrowRight />}>
                    Try the live demo
                  </DemoLink>
                  <ButtonLink href="/shop" size="lg" variant="secondary" icon={<Store />}>
                    Visit the demo shop
                  </ButtonLink>
                </div>
                <p className="text-ink-2 mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="text-moss size-3.5" strokeWidth={2.5} />
                    No sign-up
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="text-moss size-3.5" strokeWidth={2.5} />
                    Your own copy of a demo shop
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="text-moss size-3.5" strokeWidth={2.5} />
                    Nemotron runs for real
                  </span>
                </p>
              </Rise>
            </div>
            <Rise delay={0.12}>
              <CasePreview className="mx-auto w-full max-w-[560px]" />
            </Rise>
          </div>
        </section>

        {/* Built on */}
        <section aria-label="Built on" className="border-line-soft bg-paper/60 border-y">
          <div
            className={`${container} text-ink-2 flex flex-col items-center justify-between gap-4 py-6 text-sm md:flex-row`}
          >
            <p>Built on</p>
            <ul className="text-ink flex flex-wrap items-center justify-center gap-x-8 gap-y-2 font-medium">
              <li>NVIDIA Nemotron</li>
              <li aria-hidden className="text-ink-3 max-sm:hidden">
                ·
              </li>
              <li>Nebius Token Factory</li>
              <li aria-hidden className="text-ink-3 max-sm:hidden">
                ·
              </li>
              <li>PayPal Orders and Disputes APIs</li>
            </ul>
          </div>
        </section>

        {/* The problem in numbers */}
        <section className={`${container} py-20 sm:py-28`}>
          <Reveal className="max-w-[640px]">
            <p className="text-moss text-sm font-medium">The problem</p>
            <h2 className="text-ink mt-3 text-[32px] leading-[1.1] font-semibold tracking-[-0.025em] text-balance sm:text-[40px]">
              A dispute can cost more than the order
            </h2>
            <p className="text-ink-2 mt-4 text-[17px] leading-relaxed text-pretty">
              Small sellers lose disputes they could have won, and fight ones they should have
              settled. The fees, the ratio and the deadline all punish guessing.
            </p>
          </Reveal>
          <div className="mt-12">
            <Numbers />
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-line-soft bg-paper scroll-mt-20 border-t">
          <div className={`${container} py-20 sm:py-28`}>
            <Reveal className="max-w-[680px]">
              <p className="text-moss text-sm font-medium">How it works</p>
              <h2 className="text-ink mt-3 text-[32px] leading-[1.1] font-semibold tracking-[-0.025em] text-balance sm:text-[40px]">
                Three Nemotron models, each on the job it does best
              </h2>
              <p className="text-ink-2 mt-4 text-[17px] leading-relaxed text-pretty">
                Truce runs on NVIDIA Nemotron through Nebius Token Factory and routes each step by
                difficulty: the small model sorts, the vision model writes and reads photos, the
                largest model makes the call and checks the work.
              </p>
            </Reveal>
            <div className="mt-14">
              <Pipeline />
            </div>
            <div className="mt-14 grid gap-4 md:grid-cols-3">
              {MODELS.map((m, i) => (
                <Reveal
                  key={m.name}
                  delay={i * 0.06}
                  className="border-line bg-cream rounded-[16px] border p-6"
                >
                  <div className="flex items-center gap-2">
                    <ModelSwatch tier={m.tier} className="size-3" />
                    <p className="text-ink-2 text-sm font-medium">{m.role}</p>
                  </div>
                  <h3 className="text-ink mt-3 text-lg font-semibold">{m.name}</h3>
                  <p className="text-ink-2 mt-2 text-[15px] leading-relaxed">{m.body}</p>
                </Reveal>
              ))}
            </div>
            <Reveal className="border-line-strong mt-4 flex flex-col gap-4 rounded-[16px] border border-dashed p-6 sm:flex-row sm:items-start">
              <span className="rounded-card bg-mist text-moss-deep flex size-10 shrink-0 items-center justify-center">
                <Calculator className="size-5" />
              </span>
              <div>
                <h3 className="text-ink text-base font-semibold">The math is plain code</h3>
                <p className="text-ink-2 mt-1 text-[15px] leading-relaxed">
                  Fees, deadlines, the claims ratio and Seller Protection come from PayPal&rsquo;s
                  published rules and are computed, never guessed. The models read, reason and
                  write; the numbers they cite are checked.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* You approve every step */}
        <section id="approve" className="scroll-mt-20">
          <div
            className={`${container} grid items-center gap-12 py-20 sm:py-28 lg:grid-cols-2 lg:gap-20`}
          >
            <Reveal>
              <p className="text-moss text-sm font-medium">You stay in charge</p>
              <h2 className="text-ink mt-3 text-[32px] leading-[1.1] font-semibold tracking-[-0.025em] text-balance sm:text-[40px]">
                You approve every step
              </h2>
              <p className="text-ink-2 mt-4 text-[17px] leading-relaxed text-pretty">
                Truce drafts; you decide. Nothing goes to a buyer or to PayPal until you tap
                approve, and you can change every word first.
              </p>
              <ul className="mt-8 space-y-5">
                {[
                  {
                    icon: <FileCheck2 />,
                    title: "Every sentence checked",
                    body: "Each line of a draft points to the evidence behind it. Anything unsupported is flagged and fixed.",
                  },
                  {
                    icon: <ShieldCheck />,
                    title: "The cost of each move, side by side",
                    body: "Fight, settle or refund: the expected loss, the worst case, the fee and the effect on your ratio.",
                  },
                  {
                    icon: <PencilLine />,
                    title: "Your words, if you want them",
                    body: "Edit the draft in place. Truce sends exactly what you approved.",
                  },
                ].map((item) => (
                  <li key={item.title} className="flex gap-4">
                    <span className="rounded-btn bg-mist text-moss-deep flex size-9 shrink-0 items-center justify-center [&_svg]:size-[18px]">
                      {item.icon}
                    </span>
                    <div>
                      <h3 className="text-ink text-[15px] font-semibold">{item.title}</h3>
                      <p className="text-ink-2 mt-0.5 text-[15px] leading-relaxed">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.08}>
              <VerifyMock />
            </Reveal>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 px-5 pb-20 sm:px-8 sm:pb-28">
          <Reveal className="bg-ink text-cream relative mx-auto max-w-[1200px] overflow-hidden rounded-[24px] px-6 py-14 sm:px-14 sm:py-20">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-40 -right-24 size-[420px] rounded-full bg-[radial-gradient(circle,rgb(221_235_148/0.22),transparent_65%)]"
            />
            <div className="relative grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-end">
              <div>
                <p className="text-lemon text-sm font-medium">Pricing</p>
                <h2 className="mt-3 text-[32px] leading-[1.1] font-semibold tracking-[-0.025em] text-balance sm:text-[44px]">
                  A flat price. Never a cut of what you win.
                </h2>
                <p className="text-cream/75 mt-5 max-w-[560px] text-[17px] leading-relaxed text-pretty">
                  Tools that take a share of recovered money do better when you fight. Truce costs
                  the same either way, so it can tell you to refund when refunding is the cheaper,
                  fairer move.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                <DemoLink size="lg" variant="lemon" trailing={<ArrowRight />}>
                  Try the live demo
                </DemoLink>
                <ButtonLink href="/shop" size="lg" variant="inverse">
                  Visit the demo shop
                </ButtonLink>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-line-soft border-t">
        <div className={`${container} grid gap-10 py-12 sm:grid-cols-[1.4fr_1fr_1fr]`}>
          <div>
            <Logo className="h-8" />
            <p className="text-ink-2 mt-4 max-w-xs text-sm leading-relaxed">
              Fair answers to PayPal disputes, for small online sellers. You approve every step.
            </p>
          </div>
          <div>
            <h2 className="text-ink text-sm font-semibold">Try it</h2>
            <ul className="text-ink-2 mt-3 space-y-2 text-sm">
              <li>
                <Link className="hover:text-ink" href="/app">
                  Live demo
                </Link>
              </li>
              <li>
                <Link className="hover:text-ink" href="/shop">
                  Wick &amp; Ember, the demo shop
                </Link>
              </li>
              <li>
                <Link className="hover:text-ink" href="/shop/policies">
                  The demo shop&rsquo;s policies
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-ink text-sm font-semibold">Built with</h2>
            <ul className="text-ink-2 mt-3 space-y-2 text-sm">
              <li>NVIDIA Nemotron on Nebius Token Factory</li>
              <li>PayPal sandbox</li>
              <li>Next.js</li>
            </ul>
          </div>
        </div>
        <div
          className={`${container} border-line-soft text-ink-3 flex flex-col gap-2 border-t py-6 text-[13px] sm:flex-row sm:justify-between`}
        >
          <p>Wick &amp; Ember is a made-up shop. No real money moves in the demo.</p>
          <p>© 2026 Truce</p>
        </div>
      </footer>
    </div>
  );
}
