import { describe, expect, it } from "vitest";
import type { Case } from "@/lib/domain";
import { DEFAULT_NOTIFICATIONS } from "@/lib/shop-options";
import { redactForLog } from "./log";
import { markRead, notificationsFor, notify } from "./notifications";
import { MemoryStore } from "./store/memory";
import { testRealShop, testUser } from "./testing/shops";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-10-29T12:00:00.000Z");

const due = (id: string, days: number): Case =>
  ({
    id,
    buyer: { name: `Buyer ${id}`, email: "" },
    itemSummary: "A mug",
    status: "needs_you",
    dueAt: new Date(now + days * DAY).toISOString(),
  }) as Case;

describe("in-app notifications", () => {
  it("record each event once, and each member reads them separately", async () => {
    const store = new MemoryStore();
    const shop = testRealShop();
    await notify(store, shop.id, {
      id: "opened:PP-1",
      kind: "dispute_opened",
      title: "New dispute",
    });
    await notify(store, shop.id, {
      id: "opened:PP-1",
      kind: "dispute_opened",
      title: "New dispute",
    });
    const first = await notificationsFor(store, shop, "user-1", [], now);
    expect(first.notifications.map((n) => n.id)).toEqual(["opened:PP-1"]);
    expect(first.unread).toBe(1);
    await markRead(store, shop.id, "user-1");
    expect((await notificationsFor(store, shop, "user-1", [], now)).unread).toBe(0);
    expect((await notificationsFor(store, shop, "user-2", [], now)).unread).toBe(1);
  });

  it("remind about deadlines within each member's window, and follow their choices", async () => {
    const store = new MemoryStore();
    const owner = testUser("user-1");
    const shop = testRealShop(owner);
    const cases = [due("soon", 1.5), due("later", 4), due("far", 9)];
    const shown = await notificationsFor(store, shop, owner.uid, cases, now);
    // Two days is the default window: only the case due within it shows.
    expect(shown.notifications.map((n) => n.caseId)).toEqual(["soon"]);
    expect(shown.notifications[0]!.title).toBe("Buyer soon's case is due in 2 days");

    const wider = {
      ...shop,
      members: {
        [owner.uid]: {
          ...shop.members[owner.uid]!,
          notifications: { ...DEFAULT_NOTIFICATIONS, deadlineDays: 5 as const },
        },
      },
    };
    expect(
      (await notificationsFor(store, wider, owner.uid, cases, now)).notifications
        .map((n) => n.caseId)
        .sort(),
    ).toEqual(["later", "soon"]);
    const off = {
      ...shop,
      members: {
        [owner.uid]: {
          ...shop.members[owner.uid]!,
          notifications: { ...DEFAULT_NOTIFICATIONS, deadlines: false },
        },
      },
    };
    expect((await notificationsFor(store, off, owner.uid, cases, now)).notifications).toEqual([]);
  });
});

describe("structured logs", () => {
  it("never carry anything that looks like a credential", () => {
    const cleaned = redactForLog({
      shopId: "sh_1",
      clientSecret: "x",
      nested: { access_token: "y", Authorization: "Bearer z", cookie: "c", apiKey: "k" },
      error: Object.assign(new Error("PayPal said no"), { status: 401, debugId: "abc" }),
    }) as Record<string, unknown>;
    expect(JSON.stringify(cleaned)).not.toMatch(/"x"|"y"|Bearer z|"c"|"k"/);
    expect(cleaned).toMatchObject({
      shopId: "sh_1",
      clientSecret: "[redacted]",
      error: { name: "Error", message: "PayPal said no", status: 401, debugId: "abc" },
    });
  });
});
