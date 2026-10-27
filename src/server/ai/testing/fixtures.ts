import type { Address, Case, CaseEvent, Order, Tracking, Workspace } from "@/lib/domain";
import type { Store } from "@/server/store/types";

/**
 * A small Wick & Ember world for the agent's tests, shaped like the demo seed: four open cases,
 * two closed ones (the lost mug dispute and a settled size complaint) and two orders to ship.
 * Every date hangs from `anchor`, so a copy made `days` later is the same world moved in time.
 */

export const ANCHOR = Date.parse("2026-10-28T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const home = (
  line1: string,
  city: string,
  state: string,
  postalCode: string,
  line2?: string,
): Address => ({
  line1,
  ...(line2 ? { line2 } : {}),
  city,
  state,
  postalCode,
  country: "US",
});

export function world(days = 0) {
  const anchor = ANCHOR + days * DAY;
  const at = (daysAgo: number, hour: number) =>
    new Date(anchor - daysAgo * DAY + hour * HOUR).toISOString();
  const workspace: Workspace = {
    id: days ? `demo-later-${days}` : "demo-test",
    kind: "demo",
    shopName: "Wick & Ember",
    createdAt: new Date(anchor + 15 * HOUR + 55 * 60_000).toISOString(),
    expiresAt: null,
    lastSweepAt: null,
    seedVersion: `wick-ember-1@${new Date(anchor).toISOString().slice(0, 10)}`,
  };
  const now = new Date(anchor + 16 * HOUR);

  const sam = home("1400 J St", "Sacramento", "CA", "95814", "Apt 512");
  const priya = home("2207 Kinney Ave", "Austin", "TX", "78704");
  const alex = home("1760 Gaylord St", "Denver", "CO", "80206");
  const chris = home("512 E Gaston St", "Savannah", "GA", "31401");
  const dana = home("45 Chestnut St", "Asheville", "NC", "28801");
  const leah = home("4120 Fremont Ave N", "Seattle", "WA", "98103");

  const usps = (
    number: string,
    label: string,
    delivered: string | null,
    extra: Partial<Tracking> = {},
  ): Tracking => ({
    carrier: "USPS",
    number,
    uploaded: true,
    deliveredAt: delivered,
    signedFor: false,
    events: [
      {
        at: label,
        status: "accepted" as const,
        location: "PORTLAND, OR 97202",
        detail: "USPS in possession of item",
      },
      ...(delivered
        ? [
            {
              at: delivered,
              status: "delivered" as const,
              location: "SACRAMENTO, CA 95814",
              detail: "Delivered, parcel locker",
            },
          ]
        : []),
    ],
    ...extra,
  });

  const orders: Order[] = [
    {
      id: "W-1041",
      paypalOrderId: "5O190127TN364715T",
      captureId: "3C679366HH908993F",
      buyer: { name: "Sam Rivera", email: "sam@example.com" },
      items: [
        {
          productId: "p-cedar-smoke-trio",
          name: "Cedar & Smoke candle trio",
          quantity: 1,
          unitPrice: 8600,
        },
      ],
      placedAt: at(10, 3),
      status: "delivered",
      amount: 8600,
      protection: "ELIGIBLE",
      paypalAddress: sam,
      shipTo: sam,
      tracking: usps("9400111899223344556677", at(9, 17), at(4, 21)),
    },
    {
      id: "W-1063",
      paypalOrderId: "8X1234567A",
      captureId: "8X1234567C",
      buyer: { name: "Priya Shah", email: "priya@example.net" },
      items: [
        {
          productId: "p-amber-glow-pillar",
          name: "Amber Glow pillar candle",
          quantity: 1,
          unitPrice: 4200,
        },
      ],
      placedAt: at(8, 1),
      status: "delivered",
      amount: 4200,
      protection: "NOT_ELIGIBLE",
      paypalAddress: priya,
      shipTo: priya,
      tracking: usps("9400111899223344550001", at(7, 18), at(2, 20)),
    },
    {
      id: "W-1077",
      paypalOrderId: "7M0000000A",
      captureId: "7M0000000C",
      buyer: { name: "Alex Morgan", email: "alex@example.com" },
      items: [{ productId: "p-ember-mug", name: "Ember mug candle", quantity: 1, unitPrice: 2800 }],
      placedAt: at(6, 16),
      status: "delivered",
      amount: 2800,
      protection: "ELIGIBLE",
      paypalAddress: alex,
      shipTo: alex,
      tracking: usps("9400111899223344550002", at(5, 18), at(2, 21)),
    },
    {
      id: "W-1019",
      paypalOrderId: "6P0000000A",
      captureId: "6P0000000C",
      buyer: { name: "Chris Park", email: "chris@example.net" },
      items: [
        { productId: "p-honey-tobacco", name: "Honey & Tobacco", quantity: 2, unitPrice: 3200 },
      ],
      placedAt: at(21, 0),
      status: "shipped",
      amount: 6400,
      protection: "ELIGIBLE",
      paypalAddress: chris,
      shipTo: chris,
      tracking: {
        ...usps("9400111899223344550003", at(20, 17), null),
        events: [
          {
            at: at(20, 17),
            status: "accepted",
            location: "PORTLAND, OR 97202",
            detail: "USPS in possession of item",
          },
          {
            at: at(9, 6),
            status: "exception",
            location: "JACKSONVILLE, FL",
            detail: "Missent; rerouted",
          },
        ],
      },
    },
    {
      id: "W-0874",
      paypalOrderId: "1D0000000A",
      captureId: "1D0000000C",
      buyer: { name: "Dana Whitfield", email: "dana@example.org" },
      items: [{ productId: "p-ember-mug", name: "Ember mug candle", quantity: 2, unitPrice: 2800 }],
      placedAt: at(108, 13),
      status: "refunded",
      amount: 5600,
      protection: "ELIGIBLE",
      paypalAddress: dana,
      shipTo: dana,
      tracking: usps("9400111899223344550004", at(107, 17), at(103, 18)),
    },
    {
      id: "W-1101",
      paypalOrderId: "2A0000000A",
      captureId: "2A0000000C",
      buyer: { name: "Nora Castillo", email: "nora@example.com" },
      items: [{ productId: "p-fig-linen", name: "Fig & Linen", quantity: 1, unitPrice: 3200 }],
      placedAt: at(1, 17),
      status: "paid",
      amount: 3200,
      protection: "ELIGIBLE",
      paypalAddress: home("2875 Agate St", "Eugene", "OR", "97403"),
      shipTo: home("2875 Agate St", "Eugene", "OR", "97403"),
      tracking: null,
    },
    {
      id: "W-1102",
      paypalOrderId: "2B0000000A",
      captureId: "2B0000000C",
      buyer: { name: "Leah Okafor", email: "leah@example.net" },
      items: [
        {
          productId: "p-winter-grove-box",
          name: "Winter Grove gift box",
          quantity: 1,
          unitPrice: 12000,
        },
      ],
      placedAt: at(1, 21),
      status: "paid",
      amount: 12000,
      protection: "ELIGIBLE",
      paypalAddress: leah,
      shipTo: home("1201 3rd Ave", "Seattle", "WA", "98101", "Suite 2200"),
      tracking: null,
      note: "Could you ship this to my office instead? 1201 3rd Ave, Suite 2200, Seattle, WA 98101.",
    },
  ];

  const base = (
    c: Partial<Case> &
      Pick<
        Case,
        | "id"
        | "orderId"
        | "reason"
        | "stage"
        | "status"
        | "amount"
        | "buyer"
        | "itemSummary"
        | "buyerClaim"
      >,
  ): Case => ({
    paypalDisputeId: `PP-D-${c.id.length * 1000 + 121}`,
    openedAt: at(2, 17),
    dueAt: null,
    messages: [],
    photos: [],
    outcome: null,
    closedAt: null,
    moneyKept: 0,
    feeCharged: 0,
    feeAvoided: 0,
    updatedAt: at(1, 0),
    ...c,
  });

  const cases: Case[] = [
    base({
      id: "demo-inr-86",
      paypalDisputeId: "PP-D-48121",
      orderId: "W-1041",
      reason: "not_received",
      stage: "inquiry",
      status: "needs_you",
      amount: 8600,
      buyer: { name: "Sam Rivera", email: "sam@example.com" },
      itemSummary: "Cedar & Smoke candle trio",
      buyerClaim: "My candles never arrived. It's been over a week.",
      openedAt: at(2, 17),
      dueAt: at(-8, 28),
      messages: [
        {
          id: "m1",
          from: "buyer",
          at: at(2, 17),
          text: "My candles never arrived. It's been over a week.",
        },
      ],
    }),
    base({
      id: "demo-nad-42",
      paypalDisputeId: "PP-D-48133",
      orderId: "W-1063",
      reason: "not_as_described",
      stage: "inquiry",
      status: "needs_you",
      amount: 4200,
      buyer: { name: "Priya Shah", email: "priya@example.net" },
      itemSummary: "Amber Glow pillar candle",
      buyerClaim: "It's much smaller than it looked in the photos.",
      openedAt: at(1, 14),
      dueAt: at(-9, 28),
      photos: [
        {
          url: "/demo/photos/amber-glow-ruler.png",
          caption: "Buyer's photo: the Amber Glow pillar standing next to a ruler",
        },
      ],
    }),
    base({
      id: "demo-damaged-28",
      paypalDisputeId: "PP-D-48139",
      orderId: "W-1077",
      reason: "not_as_described",
      stage: "inquiry",
      status: "needs_you",
      amount: 2800,
      buyer: { name: "Alex Morgan", email: "alex@example.com" },
      itemSummary: "Ember mug candle",
      buyerClaim: "The mug arrived cracked.",
      openedAt: at(1, 23),
      dueAt: at(-10, 28),
      photos: [
        {
          url: "/demo/photos/ember-mug-cracked.png",
          caption: "Buyer's photo: the Ember mug with a crack running down from the rim",
        },
      ],
    }),
    base({
      id: "demo-inr-64",
      paypalDisputeId: "PP-D-48067",
      orderId: "W-1019",
      reason: "not_received",
      stage: "claim",
      status: "needs_you",
      amount: 6400,
      buyer: { name: "Chris Park", email: "chris@example.net" },
      itemSummary: "2 × Honey & Tobacco",
      buyerClaim: "My order still hasn't arrived, and it's been over a week.",
      openedAt: at(12, 15),
      dueAt: at(-2, 4),
    }),
    base({
      id: "demo-mug-dispute",
      paypalDisputeId: "PP-D-46988",
      orderId: "W-0874",
      reason: "not_as_described",
      stage: "claim",
      status: "closed",
      amount: 5600,
      buyer: { name: "Dana Whitfield", email: "dana@example.org" },
      itemSummary: "2 × Ember mug candle",
      buyerClaim: "Both mugs arrived broken. One is in pieces.",
      openedAt: at(102, 14),
      outcome: "lost",
      closedAt: at(86, 20),
      moneyKept: 0,
      feeCharged: 1500,
      messages: [
        {
          id: "m1",
          from: "buyer",
          at: at(102, 14),
          text: "Both mugs arrived broken. One is in pieces.",
        },
        {
          id: "m2",
          from: "paypal",
          at: at(86, 20),
          text: "We've decided this case in the buyer's favor. The buyer's photos show the items arrived damaged, and the seller didn't show what condition they were in when they shipped.",
        },
      ],
    }),
    base({
      id: "demo-size-amber-1",
      paypalDisputeId: "PP-D-47402",
      orderId: "W-1063",
      reason: "not_as_described",
      stage: "inquiry",
      status: "closed",
      amount: 4200,
      buyer: { name: "Hannah Becker", email: "hannah@example.org" },
      itemSummary: "Amber Glow pillar candle",
      buyerClaim: "This candle is tiny. The photos made it look like a big pillar.",
      openedAt: at(78, 15),
      outcome: "settled",
      closedAt: at(76, 16),
      moneyKept: 3200,
      feeAvoided: 1500,
    }),
  ];

  const events: Record<string, CaseEvent[]> = {
    "demo-mug-dispute": [
      {
        id: "e1",
        at: at(93, 17),
        kind: "evidence",
        actor: "seller",
        title: "You sent PayPal the tracking, which shows delivery",
        detail: "No photos of the mugs or of the packing went with it.",
      },
      {
        id: "e2",
        at: at(86, 20),
        kind: "decided",
        actor: "paypal",
        title: "PayPal ruled for the buyer",
      },
      {
        id: "e3",
        at: at(86, 20),
        kind: "closed",
        actor: "paypal",
        title: "Closed: $56 refunded to the buyer, plus a $15 dispute fee",
      },
    ],
  };

  return { workspace, now, orders, cases, events };
}

/** A store holding `world(days)`. */
export async function seeded(store: Store, days = 0) {
  const w = world(days);
  await store.saveWorkspace(w.workspace);
  for (const order of w.orders) await store.saveOrder(w.workspace.id, order);
  for (const kase of w.cases) await store.saveCase(w.workspace.id, kase);
  for (const [caseId, list] of Object.entries(w.events))
    for (const e of list) await store.addEvent(w.workspace.id, caseId, e);
  return w;
}
