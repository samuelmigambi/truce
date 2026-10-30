"use client";

import { useSyncExternalStore } from "react";
import { useCases } from "@/lib/client/hooks";
import { useMe, useShop } from "@/lib/client/shop-context";
import { Typewriter } from "../../ui/typewriter";

/**
 * The home page's title: a greeting for the time of day with the person's first name, then a
 * line that types itself in about where the shop stands. The wording changes from day to day,
 * so the page doesn't read the same every morning.
 */
export function Greeting() {
  const { user } = useMe();
  const shop = useShop();
  const clock = useClock();
  const cases = useCases().data?.cases;
  const name = user.name.trim().split(/\s+/)[0] ?? "";

  const needsYou = cases?.filter((c) => c.status === "needs_you") ?? [];
  const status =
    clock && cases
      ? statusLine(
          needsYou.length,
          // Only a case Truce has analyzed counts as read.
          needsYou.every((c) => c.recommendation !== null),
          cases.filter((c) => c.status !== "closed").length,
          shop.name,
          clock.day,
        )
      : null;

  return (
    <h1 className="text-ink max-w-[640px] text-[28px] leading-[1.2] font-semibold tracking-[-0.025em] text-balance sm:text-[34px]">
      <span className="block">{hello(clock?.hour ?? null, name)}</span>
      {/* Space is kept for the second line, so nothing below jumps when it arrives. */}
      <span className="text-ink-3 block min-h-[1.2em]">
        {status && <Typewriter text={status} cps={48} delay={0.3} />}
      </span>
    </h1>
  );
}

function hello(hour: number | null, name: string): string {
  const to = (words: string) => (name ? `${words}, ${name}` : words);
  // The server doesn't know the person's time of day, so it says hi until the browser does.
  if (hour === null) return name ? `Hi, ${name}` : "Hi there";
  if (hour >= 5 && hour < 12) return to("Good morning");
  if (hour >= 12 && hour < 17) return to("Good afternoon");
  if (hour >= 17 && hour < 22) return to("Good evening");
  return name ? `Up late, ${name}?` : "Up late?";
}

/** One of a few ways to say it, picked by the day so it stays put while the page is open. */
function pick(options: string[], day: number): string {
  return options[day % options.length] ?? options[0]!;
}

function statusLine(
  needsYou: number,
  allRead: boolean,
  open: number,
  shopName: string,
  day: number,
): string {
  if (needsYou === 1) {
    return pick(
      [
        "One case needs you. Let's sort it out.",
        "One case is waiting on your call.",
        "Just one case needs you today.",
      ],
      day,
    );
  }
  if (needsYou > 1) {
    return pick(
      [
        `${needsYou} cases need you. Where shall we start?`,
        `${needsYou} cases are waiting on your call.`,
        allRead
          ? `${needsYou} cases need you. I've read them all.`
          : `${needsYou} cases need you today.`,
      ],
      day,
    );
  }
  if (open > 0) {
    return pick(
      [
        "Nothing needs you right now. Ask me anything.",
        "All caught up. Curious about something?",
        "You're on top of it. What should we look into?",
      ],
      day,
    );
  }
  return pick(
    [
      `All quiet at ${shopName}. What's on your mind?`,
      `No open disputes at ${shopName}. Ask me anything.`,
      `${shopName} is dispute-free. What would you like to know?`,
    ],
    day,
  );
}

const never = () => () => {};

/**
 * The hour and the day where the person is. Null while rendering on the server, so the markup
 * matches until the browser takes over. The snapshot is a string so React sees it unchanged.
 */
function useClock(): { hour: number; day: number } | null {
  const snapshot = useSyncExternalStore(
    never,
    () => {
      const now = new Date();
      const day = Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000);
      return `${now.getHours()}:${day}`;
    },
    () => null,
  );
  if (!snapshot) return null;
  const [hour, day] = snapshot.split(":").map(Number);
  return { hour: hour ?? 0, day: day ?? 0 };
}
