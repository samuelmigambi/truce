"use client";

import { motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { duration, ease, spring } from "../../motion";
import { cn } from "../../ui/cn";
import { PageHeader, Screen } from "../page-header";
import { NotificationsSection, PoliciesSection, ShopSection } from "./form-sections";
import { DangerSection, PlanSection, TeamSection } from "./more-sections";
import { PayPalSection } from "./paypal-section";

const SECTIONS = [
  { id: "shop", label: "Shop" },
  { id: "policies", label: "Policies" },
  { id: "paypal", label: "PayPal" },
  { id: "notifications", label: "Notifications" },
  { id: "team", label: "Team" },
  { id: "plan", label: "Plan" },
  { id: "danger", label: "Danger zone" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/** The section in view, so the page nav can follow the reader down the page. */
function useSectionInView(): SectionId {
  const [active, setActive] = useState<SectionId>("shop");
  useEffect(() => {
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target.id, entry.isIntersecting);
        const first = SECTIONS.find((s) => seen.get(s.id));
        if (first) setActive(first.id);
      },
      // A section counts once it reaches the upper third of the screen.
      { rootMargin: "-15% 0px -60% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);
  return active;
}

/** Settings: the shop, its policies and PayPal, your notifications, the team and the plan. */
export function SettingsScreen() {
  const active = useSectionInView();

  // Arriving at #paypal (from a banner or a notification) lands on that section once it's drawn.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <Screen>
      <PageHeader title="Settings" />

      <div className="mt-8 xl:grid xl:grid-cols-[176px_minmax(0,1fr)] xl:gap-10">
        <nav aria-label="Settings sections" className="max-xl:hidden">
          <ul className="sticky top-8 space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={active === s.id ? "location" : undefined}
                  className={cn(
                    "rounded-btn relative flex h-8 items-center px-2.5 text-[13.5px] font-medium transition-colors",
                    active === s.id ? "text-ink" : "text-ink-2 hover:text-ink",
                    s.id === "danger" && active !== s.id && "text-risk-700/80 hover:text-risk-700",
                  )}
                >
                  {active === s.id && (
                    <motion.span
                      layoutId="settings-nav"
                      transition={spring.snappy}
                      className="rounded-btn bg-ink/[0.06] absolute inset-0"
                    />
                  )}
                  <span className="relative">{s.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-[760px] min-w-0 space-y-5">
          <Stagger index={0}>
            <ShopSection />
          </Stagger>
          <Stagger index={1}>
            <PoliciesSection />
          </Stagger>
          <Stagger index={2}>
            <PayPalSection />
          </Stagger>
          <Stagger index={3}>
            <NotificationsSection />
          </Stagger>
          <Stagger index={4}>
            <TeamSection />
          </Stagger>
          <Stagger index={5}>
            <PlanSection />
          </Stagger>
          <Stagger index={6}>
            <DangerSection />
          </Stagger>
        </div>
      </div>
    </Screen>
  );
}

function Stagger({ index, children }: { index: number; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.base, ease: ease.out, delay: Math.min(index, 4) * 0.04 }}
    >
      {children}
    </motion.div>
  );
}
