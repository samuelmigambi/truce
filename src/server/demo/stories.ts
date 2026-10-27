import type {
  Address,
  Buyer,
  CaseEventKind,
  CaseMessage,
  CaseOutcome,
  CasePhoto,
  CaseStatus,
  DisputeReason,
  DisputeStage,
  ProtectionStatus,
} from "@/lib/domain";
import type { Cents } from "@/lib/money";
import { addressIn, CITIES, type City } from "./places";
import type { DeliveredAt } from "./usps";

/**
 * The demo's story: five open cases that each call for a different move, twelve closed ones that
 * give the dashboard its history and its patterns, and two orders waiting to ship. Times are
 * "days before the seed's anchor" plus a UTC clock time, chosen to land in US daytime.
 */

/** Days before the anchor, and a UTC clock time. */
export type When = [daysAgo: number, utc: string];

export interface StoryOrder {
  key: string;
  placed: When;
  buyer: Buyer;
  city: City;
  /** The address on the PayPal payment. */
  home: Address;
  /** Where the label goes, when it isn't PayPal's address. */
  shipTo?: Address;
  items: { productId: string; quantity: number }[];
  protection: ProtectionStatus;
  ship?: {
    label: When;
    deliver?: When;
    deliveredAt?: DeliveredAt;
    trouble?: { kind: "late" | "missent"; at: When; missentTo?: string };
    /** Overrides the plants on the way, for a parcel that goes astray. */
    route?: string[];
  };
  refunded?: "full" | "partial";
  note?: string;
}

export interface StoryEvent {
  at: When;
  kind: CaseEventKind;
  actor: "buyer" | "seller" | "truce" | "paypal";
  title: string;
  detail?: string;
}

export interface StoryCase {
  id: string;
  disputeNumber: number;
  orderKey: string;
  reason: DisputeReason;
  stage: DisputeStage;
  status: CaseStatus;
  opened: When;
  /** PayPal-style due date: the end of the day this many days after the anchor, US Central time. */
  dueInDays?: number;
  buyerClaim: string;
  messages: { from: CaseMessage["from"]; at: When; text: string }[];
  photos?: CasePhoto[];
  events: StoryEvent[];
  closed?: { outcome: CaseOutcome; at: When; refunded: Cents };
}

const c = CITIES;
const buyer = (name: string, email: string): Buyer => ({ name, email });

export const PHOTOS = {
  amberRuler: {
    url: "/demo/photos/amber-glow-ruler.png",
    caption: "Buyer's photo: the Amber Glow pillar standing next to a ruler",
  },
  crackedMug: {
    url: "/demo/photos/ember-mug-cracked.png",
    caption: "Buyer's photo: the Ember mug with a crack running down from the rim",
  },
} satisfies Record<string, CasePhoto>;

export const STORY_ORDERS: StoryOrder[] = [
  // ---------- The five open cases ----------
  {
    key: "inr-86",
    placed: [10, "03:12"],
    buyer: buyer("Sam Rivera", "sam.rivera@example.com"),
    city: c.sacramento!,
    home: addressIn(c.sacramento!, "1400 J St", "Apt 512"),
    items: [{ productId: "p-cedar-smoke-trio", quantity: 1 }],
    protection: "ELIGIBLE",
    ship: { label: [9, "17:20"], deliver: [4, "21:14"], deliveredAt: "locker" },
  },
  {
    key: "nad-42",
    placed: [8, "01:40"],
    buyer: buyer("Priya Shah", "priya.shah@example.net"),
    city: c.austin!,
    home: addressIn(c.austin!, "2207 Kinney Ave"),
    items: [{ productId: "p-amber-glow-pillar", quantity: 1 }],
    protection: "NOT_ELIGIBLE",
    ship: { label: [7, "18:05"], deliver: [2, "20:40"], deliveredAt: "mailbox" },
  },
  {
    key: "unauth-120",
    placed: [12, "02:55"],
    buyer: buyer("Jordan Lee", "jordan.lee@example.org"),
    city: c.minneapolis!,
    home: addressIn(c.minneapolis!, "3348 Minnehaha Ave"),
    items: [{ productId: "p-winter-grove-box", quantity: 1 }],
    protection: "ELIGIBLE",
    ship: { label: [11, "17:45"], deliver: [7, "19:52"], deliveredAt: "porch" },
  },
  {
    key: "damaged-28",
    placed: [6, "16:30"],
    buyer: buyer("Alex Morgan", "alex.morgan@example.com"),
    city: c.denver!,
    home: addressIn(c.denver!, "1760 Gaylord St"),
    items: [{ productId: "p-ember-mug", quantity: 1 }],
    protection: "ELIGIBLE",
    ship: { label: [5, "18:10"], deliver: [2, "21:10"], deliveredAt: "porch" },
  },
  {
    key: "inr-64",
    placed: [21, "00:35"],
    buyer: buyer("Chris Park", "chris.park@example.net"),
    city: c.savannah!,
    home: addressIn(c.savannah!, "512 E Gaston St"),
    items: [{ productId: "p-honey-tobacco", quantity: 2 }],
    protection: "ELIGIBLE",
    ship: {
      label: [20, "17:30"],
      route: ["DENVER CO NETWORK DISTRIBUTION CENTER", "ATLANTA GA NETWORK DISTRIBUTION CENTER"],
      trouble: {
        kind: "missent",
        at: [9, "06:40"],
        missentTo: "JACKSONVILLE FL DISTRIBUTION CENTER",
      },
    },
  },

  // ---------- Closed cases ----------
  {
    key: "size-amber-1",
    placed: [84, "18:20"],
    buyer: buyer("Hannah Becker", "hannah.becker@example.org"),
    city: c.madison!,
    home: addressIn(c.madison!, "614 E Johnson St"),
    items: [{ productId: "p-amber-glow-pillar", quantity: 1 }],
    protection: "ELIGIBLE",
    ship: { label: [83, "17:10"], deliver: [79, "20:30"], deliveredAt: "mailbox" },
    refunded: "partial",
  },
  {
    key: "charged-twice",
    placed: [72, "23:10"],
    buyer: buyer("Marcus Bellamy", "mbellamy@example.com"),
    city: c.columbus!,
    home: addressIn(c.columbus!, "88 Buttles Ave"),
    items: [{ productId: "p-fig-linen", quantity: 1 }],
    protection: "ELIGIBLE",
    ship: { label: [71, "16:40"], deliver: [66, "18:15"], deliveredAt: "mailbox" },
  },
  {
    key: "inr-porch",
    placed: [70, "04:20"],
    buyer: buyer("Tessa Nguyen", "tessa.nguyen@example.net"),
    city: c.sanDiego!,
    home: addressIn(c.sanDiego!, "3315 Thorn St"),
    items: [{ productId: "p-salt-sea-moss", quantity: 1 }],
    protection: "ELIGIBLE",
    ship: { label: [69, "17:55"], deliver: [66, "20:22"], deliveredAt: "porch" },
  },
  {
    key: "scent",
    placed: [63, "15:35"],
    buyer: buyer("Olivia Brandt", "olivia.brandt@example.com"),
    city: c.boise!,
    home: addressIn(c.boise!, "1219 N 17th St"),
    items: [{ productId: "p-salt-sea-moss", quantity: 1 }],
    protection: "ELIGIBLE",
    ship: { label: [62, "17:15"], deliver: [59, "19:48"], deliveredAt: "mailbox" },
    refunded: "full",
  },
  {
    key: "inr-late",
    placed: [89, "01:05"],
    buyer: buyer("Owen Fletcher", "owen.fletcher@example.org"),
    city: c.kansasCity!,
    home: addressIn(c.kansasCity!, "4120 Locust St"),
    items: [
      { productId: "p-salt-sea-moss", quantity: 1 },
      { productId: "p-fig-linen", quantity: 1 },
    ],
    protection: "ELIGIBLE",
    ship: {
      label: [88, "17:25"],
      deliver: [81, "21:40"],
      deliveredAt: "mailbox",
      trouble: { kind: "late", at: [84, "09:15"] },
    },
  },
  {
    key: "size-fig",
    placed: [55, "02:50"],
    buyer: buyer("Daniel Ortiz", "daniel.ortiz@example.net"),
    city: c.phoenix!,
    home: addressIn(c.phoenix!, "2031 N 11th St"),
    items: [{ productId: "p-fig-linen", quantity: 1 }],
    protection: "ELIGIBLE",
    ship: { label: [54, "16:30"], deliver: [51, "22:05"], deliveredAt: "mailbox" },
    refunded: "partial",
  },
  {
    key: "inr-lost",
    placed: [49, "14:15"],
    buyer: buyer("Grace Whitaker", "gwhitaker@example.com"),
    city: c.richmond!,
    home: addressIn(c.richmond!, "2410 Grove Ave"),
    items: [{ productId: "p-honey-tobacco", quantity: 1 }],
    protection: "ELIGIBLE",
    ship: { label: [48, "17:40"], trouble: { kind: "late", at: [44, "10:05"] } },
    refunded: "full",
  },
  {
    key: "damaged-jar",
    placed: [38, "00:45"],
    buyer: buyer("Ben Hollis", "ben.hollis@example.org"),
    city: c.raleigh!,
    home: addressIn(c.raleigh!, "517 Polk St"),
    items: [{ productId: "p-winter-grove-box", quantity: 1 }],
    protection: "ELIGIBLE",
    ship: { label: [37, "16:55"], deliver: [34, "19:30"], deliveredAt: "porch" },
    refunded: "partial",
  },
  {
    key: "inr-neighbor",
    placed: [33, "21:30"],
    buyer: buyer("Isabel Ferreira", "isabel.ferreira@example.com"),
    city: c.brooklyn!,
    home: addressIn(c.brooklyn!, "271 6th Ave", "Apt 3R"),
    items: [{ productId: "p-cedar-smoke-trio", quantity: 1 }],
    protection: "ELIGIBLE",
    ship: { label: [32, "17:20"], deliver: [28, "17:55"], deliveredAt: "individual" },
  },
  {
    key: "size-amber-2",
    placed: [26, "01:15"],
    buyer: buyer("Kayla Simmons", "kayla.simmons@example.net"),
    city: c.nashville!,
    home: addressIn(c.nashville!, "1108 Russell St"),
    items: [{ productId: "p-amber-glow-pillar", quantity: 1 }],
    protection: "ELIGIBLE",
    ship: { label: [25, "17:35"], deliver: [21, "20:10"], deliveredAt: "mailbox" },
    refunded: "partial",
  },
  {
    key: "mug-dispute",
    placed: [108, "13:25"],
    buyer: buyer("Dana Whitfield", "dana.whitfield@example.org"),
    city: c.asheville!,
    home: addressIn(c.asheville!, "45 Chestnut St"),
    items: [{ productId: "p-ember-mug", quantity: 2 }],
    protection: "ELIGIBLE",
    ship: { label: [107, "17:05"], deliver: [103, "18:40"], deliveredAt: "porch" },
    refunded: "full",
  },
  {
    key: "unauth-won",
    placed: [118, "02:10"],
    buyer: buyer("Victor Hale", "victor.hale@example.com"),
    city: c.dallas!,
    home: addressIn(c.dallas!, "5822 Vickery Blvd"),
    items: [{ productId: "p-cedar-smoke-trio", quantity: 1 }],
    protection: "ELIGIBLE",
    ship: { label: [117, "17:25"], deliver: [113, "19:15"], deliveredAt: "porch" },
  },

  // ---------- Ready to ship ----------
  {
    key: "to-ship-1101",
    placed: [1, "17:42"],
    buyer: buyer("Nora Castillo", "nora.castillo@example.com"),
    city: c.eugene!,
    home: addressIn(c.eugene!, "2875 Agate St"),
    items: [
      { productId: "p-fig-linen", quantity: 1 },
      { productId: "p-brass-trimmer", quantity: 1 },
    ],
    protection: "ELIGIBLE",
  },
  {
    key: "to-ship-1102",
    placed: [1, "21:15"],
    buyer: buyer("Leah Okafor", "leah.okafor@example.net"),
    city: c.seattle!,
    home: addressIn(c.seattle!, "4120 Fremont Ave N"),
    shipTo: {
      line1: "1201 3rd Ave",
      line2: "Suite 2200",
      city: "Seattle",
      state: "WA",
      postalCode: "98101",
      country: "US",
    },
    items: [{ productId: "p-winter-grove-box", quantity: 1 }],
    protection: "ELIGIBLE",
    note: "Could you ship this to my office instead? 1201 3rd Ave, Suite 2200, Seattle, WA 98101. Packages keep going missing from my porch.",
  },
];

/** The two orders waiting to ship always get these numbers. */
export const TO_SHIP_IDS = { "to-ship-1101": "W-1101", "to-ship-1102": "W-1102" } as const;

export const STORY_CASES: StoryCase[] = [
  // ---------- Open ----------
  {
    id: "demo-inr-86",
    disputeNumber: 48121,
    orderKey: "inr-86",
    reason: "not_received",
    stage: "inquiry",
    status: "needs_you",
    opened: [2, "17:05"],
    dueInDays: 8,
    buyerClaim: "My candles never arrived. It's been over a week.",
    messages: [
      { from: "buyer", at: [2, "17:05"], text: "My candles never arrived. It's been over a week." },
    ],
    events: [
      {
        at: [2, "17:05"],
        kind: "opened",
        actor: "buyer",
        title: "Sam Rivera opened an inquiry: item not received",
      },
    ],
  },
  {
    id: "demo-nad-42",
    disputeNumber: 48133,
    orderKey: "nad-42",
    reason: "not_as_described",
    stage: "inquiry",
    status: "needs_you",
    opened: [1, "14:25"],
    dueInDays: 9,
    buyerClaim: "It's much smaller than it looked in the photos.",
    messages: [
      { from: "buyer", at: [1, "14:25"], text: "It's much smaller than it looked in the photos." },
      {
        from: "buyer",
        at: [1, "14:31"],
        text: "Here's a photo of it next to a ruler. From the pictures I expected something much bigger, more like a centerpiece.",
      },
    ],
    photos: [PHOTOS.amberRuler],
    events: [
      {
        at: [1, "14:25"],
        kind: "opened",
        actor: "buyer",
        title: "Priya Shah opened an inquiry: not as described",
      },
    ],
  },
  {
    id: "demo-unauth-120",
    disputeNumber: 48114,
    orderKey: "unauth-120",
    reason: "unauthorized",
    stage: "claim",
    status: "needs_you",
    opened: [3, "16:18"],
    dueInDays: 7,
    buyerClaim: "I didn't make this purchase.",
    messages: [
      { from: "buyer", at: [3, "16:18"], text: "I didn't make this purchase." },
      {
        from: "paypal",
        at: [3, "16:19"],
        text: "The buyer says they didn't authorize this payment. Send proof that the order was shipped and delivered to the address on the payment.",
      },
    ],
    events: [
      {
        at: [3, "16:18"],
        kind: "opened",
        actor: "buyer",
        title: "Jordan Lee filed a claim: unauthorized payment",
      },
      {
        at: [3, "16:19"],
        kind: "note",
        actor: "paypal",
        title: "PayPal asked for proof of fulfillment",
      },
    ],
  },
  {
    id: "demo-damaged-28",
    disputeNumber: 48139,
    orderKey: "damaged-28",
    reason: "not_as_described",
    stage: "inquiry",
    status: "needs_you",
    opened: [1, "23:05"],
    dueInDays: 10,
    buyerClaim: "The mug arrived cracked.",
    messages: [
      { from: "buyer", at: [1, "23:05"], text: "The mug arrived cracked." },
      {
        from: "buyer",
        at: [1, "23:08"],
        text: "There's a crack running from the rim down the side, and the wax has split along it. I've attached a photo. The box looked fine from the outside.",
      },
    ],
    photos: [PHOTOS.crackedMug],
    events: [
      {
        at: [1, "23:05"],
        kind: "opened",
        actor: "buyer",
        title: "Alex Morgan opened an inquiry: not as described",
      },
    ],
  },
  {
    id: "demo-inr-64",
    disputeNumber: 48067,
    orderKey: "inr-64",
    reason: "not_received",
    stage: "claim",
    status: "needs_you",
    opened: [12, "15:30"],
    dueInDays: 2,
    buyerClaim: "My order still hasn't arrived, and it's been over a week.",
    messages: [
      {
        from: "buyer",
        at: [12, "15:30"],
        text: "My order still hasn't arrived, and it's been over a week.",
      },
      {
        from: "seller",
        at: [11, "17:05"],
        text: "So sorry for the wait! USPS shows your parcel on its way, so it should be with you in a couple of days. We'll keep an eye on it.",
      },
      {
        from: "buyer",
        at: [9, "14:12"],
        text: "Tracking now says there's a problem and it still hasn't come. I'd like a refund, please.",
      },
      {
        from: "paypal",
        at: [9, "14:13"],
        text: "The buyer escalated this case to a claim. PayPal will review it if it isn't resolved by the response date.",
      },
    ],
    events: [
      {
        at: [12, "15:30"],
        kind: "opened",
        actor: "buyer",
        title: "Chris Park opened an inquiry: item not received",
      },
      { at: [11, "17:05"], kind: "message", actor: "seller", title: "You replied to Chris Park" },
      {
        at: [9, "14:12"],
        kind: "escalated",
        actor: "buyer",
        title: "Chris Park escalated it to a claim",
      },
      {
        at: [9, "14:13"],
        kind: "note",
        actor: "paypal",
        title: "PayPal asked for proof of delivery",
      },
    ],
  },

  // ---------- Closed ----------
  {
    id: "demo-size-amber-1",
    disputeNumber: 47402,
    orderKey: "size-amber-1",
    reason: "not_as_described",
    stage: "inquiry",
    status: "closed",
    opened: [78, "15:05"],
    buyerClaim: "This candle is tiny. The photos made it look like a big pillar.",
    messages: [
      {
        from: "buyer",
        at: [78, "15:05"],
        text: "This candle is tiny. The photos made it look like a big pillar.",
      },
      {
        from: "seller",
        at: [77, "18:40"],
        text: "Sorry it wasn't what you expected. The listing gives the size as 3 in wide by 4 in tall, but we'd like to make it right: we've offered a $10 partial refund, and you can keep the candle.",
      },
      { from: "buyer", at: [76, "16:02"], text: "Thanks, that's fine." },
    ],
    events: [
      {
        at: [78, "15:05"],
        kind: "opened",
        actor: "buyer",
        title: "Hannah Becker opened an inquiry: not as described",
      },
      {
        at: [77, "18:40"],
        kind: "offer",
        actor: "seller",
        title: "You offered a $10 partial refund",
      },
      {
        at: [76, "16:02"],
        kind: "buyer_reply",
        actor: "buyer",
        title: "Hannah Becker accepted the $10 offer",
      },
      { at: [76, "16:03"], kind: "closed", actor: "paypal", title: "Closed: settled for $10" },
    ],
    closed: { outcome: "settled", at: [76, "16:03"], refunded: 1000 },
  },
  {
    id: "demo-charged-twice",
    disputeNumber: 47471,
    orderKey: "charged-twice",
    reason: "other",
    stage: "inquiry",
    status: "closed",
    opened: [70, "13:50"],
    buyerClaim: "I was charged twice for this order.",
    messages: [
      { from: "buyer", at: [70, "13:50"], text: "I was charged twice for this order." },
      {
        from: "seller",
        at: [70, "17:25"],
        text: "We only see one payment for this order. The second charge is probably a temporary hold from your bank, which usually drops off within a few days.",
      },
      {
        from: "buyer",
        at: [68, "12:10"],
        text: "You're right, the second charge is gone. Sorry for the trouble!",
      },
    ],
    events: [
      {
        at: [70, "13:50"],
        kind: "opened",
        actor: "buyer",
        title: "Marcus Bellamy opened an inquiry: charged twice",
      },
      {
        at: [70, "17:25"],
        kind: "message",
        actor: "seller",
        title: "You replied to Marcus Bellamy",
      },
      {
        at: [68, "12:12"],
        kind: "closed",
        actor: "buyer",
        title: "Marcus Bellamy closed the case",
      },
    ],
    closed: { outcome: "buyer_closed", at: [68, "12:12"], refunded: 0 },
  },
  {
    id: "demo-inr-porch",
    disputeNumber: 47498,
    orderKey: "inr-porch",
    reason: "not_received",
    stage: "inquiry",
    status: "closed",
    opened: [64, "16:45"],
    buyerClaim: "My package never came.",
    messages: [
      { from: "buyer", at: [64, "16:45"], text: "My package never came." },
      {
        from: "seller",
        at: [64, "18:30"],
        text: "USPS shows it was delivered to your front porch two days ago, just after 1 pm. Could it be tucked somewhere out of sight? The tracking number is on your PayPal receipt.",
      },
      {
        from: "buyer",
        at: [63, "02:15"],
        text: "Found it behind the planter by the door. Sorry about that!",
      },
    ],
    events: [
      {
        at: [64, "16:45"],
        kind: "opened",
        actor: "buyer",
        title: "Tessa Nguyen opened an inquiry: item not received",
      },
      {
        at: [64, "18:30"],
        kind: "message",
        actor: "seller",
        title: "You replied with the tracking",
      },
      { at: [63, "02:16"], kind: "closed", actor: "buyer", title: "Tessa Nguyen closed the case" },
    ],
    closed: { outcome: "buyer_closed", at: [63, "02:16"], refunded: 0 },
  },
  {
    id: "demo-scent",
    disputeNumber: 47533,
    orderKey: "scent",
    reason: "not_as_described",
    stage: "inquiry",
    status: "closed",
    opened: [57, "03:30"],
    buyerClaim: "I can barely smell it, even when it's lit.",
    messages: [
      { from: "buyer", at: [57, "03:30"], text: "I can barely smell it, even when it's lit." },
      {
        from: "seller",
        at: [56, "17:20"],
        text: "Sorry it didn't work for you. We've refunded you in full, and there's no need to send it back.",
      },
    ],
    events: [
      {
        at: [57, "03:30"],
        kind: "opened",
        actor: "buyer",
        title: "Olivia Brandt opened an inquiry: not as described",
      },
      {
        at: [56, "17:20"],
        kind: "message",
        actor: "seller",
        title: "You refunded Olivia Brandt in full",
      },
      { at: [56, "17:21"], kind: "closed", actor: "paypal", title: "Closed: refunded in full" },
    ],
    closed: { outcome: "refunded", at: [56, "17:21"], refunded: 3800 },
  },
  {
    id: "demo-inr-late",
    disputeNumber: 47361,
    orderKey: "inr-late",
    reason: "not_received",
    stage: "inquiry",
    status: "closed",
    opened: [83, "14:10"],
    buyerClaim: "It's been almost a week and my order still isn't here.",
    messages: [
      {
        from: "buyer",
        at: [83, "14:10"],
        text: "It's been almost a week and my order still isn't here.",
      },
      {
        from: "seller",
        at: [83, "16:45"],
        text: "It's on its way, just slowly: USPS has it moving through Kansas City, and it should reach you in the next day or two.",
      },
      { from: "buyer", at: [81, "23:30"], text: "It just arrived. Thank you!" },
    ],
    events: [
      {
        at: [83, "14:10"],
        kind: "opened",
        actor: "buyer",
        title: "Owen Fletcher opened an inquiry: item not received",
      },
      {
        at: [83, "16:45"],
        kind: "message",
        actor: "seller",
        title: "You replied with the tracking",
      },
      { at: [81, "23:31"], kind: "closed", actor: "buyer", title: "Owen Fletcher closed the case" },
    ],
    closed: { outcome: "buyer_closed", at: [81, "23:31"], refunded: 0 },
  },
  {
    id: "demo-size-fig",
    disputeNumber: 47589,
    orderKey: "size-fig",
    reason: "not_as_described",
    stage: "inquiry",
    status: "closed",
    opened: [50, "15:40"],
    buyerClaim:
      "Smaller than I expected for the price. The jar is barely three and a half inches tall.",
    messages: [
      {
        from: "buyer",
        at: [50, "15:40"],
        text: "Smaller than I expected for the price. The jar is barely three and a half inches tall.",
      },
      {
        from: "seller",
        at: [49, "17:05"],
        text: "Sorry about that. The listing gives the jar as 3 in wide by 3.5 in tall, but we've offered a $10 partial refund so you can keep it.",
      },
      { from: "buyer", at: [48, "04:12"], text: "Okay, thank you." },
    ],
    events: [
      {
        at: [50, "15:40"],
        kind: "opened",
        actor: "buyer",
        title: "Daniel Ortiz opened an inquiry: not as described",
      },
      {
        at: [49, "17:05"],
        kind: "offer",
        actor: "seller",
        title: "You offered a $10 partial refund",
      },
      {
        at: [48, "04:12"],
        kind: "buyer_reply",
        actor: "buyer",
        title: "Daniel Ortiz accepted the $10 offer",
      },
      { at: [48, "04:13"], kind: "closed", actor: "paypal", title: "Closed: settled for $10" },
    ],
    closed: { outcome: "settled", at: [48, "04:13"], refunded: 1000 },
  },
  {
    id: "demo-inr-lost",
    disputeNumber: 47622,
    orderKey: "inr-lost",
    reason: "not_received",
    stage: "inquiry",
    status: "closed",
    opened: [41, "13:20"],
    buyerClaim: "Still waiting on my candle. Tracking hasn't changed in days.",
    messages: [
      {
        from: "buyer",
        at: [41, "13:20"],
        text: "Still waiting on my candle. Tracking hasn't changed in days.",
      },
      {
        from: "seller",
        at: [40, "16:50"],
        text: "We're so sorry. It looks lost in the mail, so we've refunded you in full and asked USPS to search for it.",
      },
    ],
    events: [
      {
        at: [41, "13:20"],
        kind: "opened",
        actor: "buyer",
        title: "Grace Whitaker opened an inquiry: item not received",
      },
      {
        at: [40, "16:50"],
        kind: "message",
        actor: "seller",
        title: "You refunded Grace Whitaker in full",
      },
      { at: [40, "16:51"], kind: "closed", actor: "paypal", title: "Closed: refunded in full" },
    ],
    closed: { outcome: "refunded", at: [40, "16:51"], refunded: 3200 },
  },
  {
    id: "demo-damaged-jar",
    disputeNumber: 47668,
    orderKey: "damaged-jar",
    reason: "not_as_described",
    stage: "inquiry",
    status: "closed",
    opened: [33, "13:05"],
    buyerClaim: "One of the two jars in the gift box arrived cracked.",
    messages: [
      {
        from: "buyer",
        at: [33, "13:05"],
        text: "One of the two jars in the gift box arrived cracked.",
      },
      {
        from: "buyer",
        at: [33, "13:07"],
        text: "The other jar and the trimmer are fine. The cracked one is leaking wax onto the box.",
      },
      {
        from: "seller",
        at: [33, "16:20"],
        text: "We're sorry it arrived like that. We've offered $40, about the price of one jar, as a partial refund. There's no need to send anything back.",
      },
      { from: "buyer", at: [32, "01:10"], text: "That works, thank you." },
    ],
    events: [
      {
        at: [33, "13:05"],
        kind: "opened",
        actor: "buyer",
        title: "Ben Hollis opened an inquiry: not as described",
      },
      {
        at: [33, "16:20"],
        kind: "offer",
        actor: "seller",
        title: "You offered a $40 partial refund",
      },
      {
        at: [32, "01:10"],
        kind: "buyer_reply",
        actor: "buyer",
        title: "Ben Hollis accepted the $40 offer",
      },
      { at: [32, "01:11"], kind: "closed", actor: "paypal", title: "Closed: settled for $40" },
    ],
    closed: { outcome: "settled", at: [32, "01:11"], refunded: 4000 },
  },
  {
    id: "demo-inr-neighbor",
    disputeNumber: 47693,
    orderKey: "inr-neighbor",
    reason: "not_received",
    stage: "inquiry",
    status: "closed",
    opened: [27, "14:40"],
    buyerClaim: "Tracking says it was delivered, but I don't have it.",
    messages: [
      {
        from: "buyer",
        at: [27, "14:40"],
        text: "Tracking says it was delivered, but I don't have it.",
      },
      {
        from: "seller",
        at: [27, "16:10"],
        text: "USPS shows it was handed to someone at your building yesterday, just before 2 pm. Could a neighbor have taken it in?",
      },
      { from: "buyer", at: [25, "22:25"], text: "A neighbor had it! Thanks for the quick reply." },
    ],
    events: [
      {
        at: [27, "14:40"],
        kind: "opened",
        actor: "buyer",
        title: "Isabel Ferreira opened an inquiry: item not received",
      },
      {
        at: [27, "16:10"],
        kind: "message",
        actor: "seller",
        title: "You replied with the tracking",
      },
      {
        at: [25, "22:26"],
        kind: "closed",
        actor: "buyer",
        title: "Isabel Ferreira closed the case",
      },
    ],
    closed: { outcome: "buyer_closed", at: [25, "22:26"], refunded: 0 },
  },
  {
    id: "demo-size-amber-2",
    disputeNumber: 47731,
    orderKey: "size-amber-2",
    reason: "not_as_described",
    stage: "inquiry",
    status: "closed",
    opened: [19, "15:15"],
    buyerClaim: "Much smaller than it looks online. I expected something like 6 inches tall.",
    messages: [
      {
        from: "buyer",
        at: [19, "15:15"],
        text: "Much smaller than it looks online. I expected something like 6 inches tall.",
      },
      {
        from: "seller",
        at: [18, "17:30"],
        text: "Sorry it wasn't what you pictured. The listing gives it as 3 in wide by 4 in tall, but we've offered a $10 partial refund, and you're welcome to keep it.",
      },
      { from: "buyer", at: [17, "13:45"], text: "That's fair. Thanks." },
    ],
    events: [
      {
        at: [19, "15:15"],
        kind: "opened",
        actor: "buyer",
        title: "Kayla Simmons opened an inquiry: not as described",
      },
      {
        at: [18, "17:30"],
        kind: "offer",
        actor: "seller",
        title: "You offered a $10 partial refund",
      },
      {
        at: [17, "13:45"],
        kind: "buyer_reply",
        actor: "buyer",
        title: "Kayla Simmons accepted the $10 offer",
      },
      { at: [17, "13:46"], kind: "closed", actor: "paypal", title: "Closed: settled for $10" },
    ],
    closed: { outcome: "settled", at: [17, "13:46"], refunded: 1000 },
  },
  {
    id: "demo-mug-dispute",
    disputeNumber: 46988,
    orderKey: "mug-dispute",
    reason: "not_as_described",
    stage: "claim",
    status: "closed",
    opened: [102, "14:30"],
    buyerClaim: "Both mugs arrived broken. One is in pieces.",
    messages: [
      { from: "buyer", at: [102, "14:30"], text: "Both mugs arrived broken. One is in pieces." },
      {
        from: "seller",
        at: [101, "18:15"],
        text: "We pack every mug in recycled paper, so this must have happened in transit. We can't refund for damage caused by the carrier.",
      },
      {
        from: "buyer",
        at: [95, "15:50"],
        text: "The seller won't help, so I'm asking PayPal. I've uploaded photos of both broken mugs.",
      },
      {
        from: "paypal",
        at: [95, "15:51"],
        text: "The buyer escalated this case to a claim. Send any evidence you have by the response date.",
      },
      {
        from: "paypal",
        at: [86, "20:30"],
        text: "We've decided this case in the buyer's favor. The buyer's photos show the items arrived damaged, and the seller didn't show what condition they were in when they shipped.",
      },
    ],
    events: [
      {
        at: [102, "14:30"],
        kind: "opened",
        actor: "buyer",
        title: "Dana Whitfield opened an inquiry: not as described",
      },
      {
        at: [101, "18:15"],
        kind: "message",
        actor: "seller",
        title: "You replied to Dana Whitfield",
      },
      {
        at: [95, "15:50"],
        kind: "escalated",
        actor: "buyer",
        title: "Dana Whitfield escalated it to a claim",
      },
      {
        at: [93, "17:00"],
        kind: "evidence",
        actor: "seller",
        title: "You sent PayPal the tracking, which shows delivery",
        detail: "No photos of the mugs or of the packing went with it.",
      },
      { at: [86, "20:30"], kind: "decided", actor: "paypal", title: "PayPal ruled for the buyer" },
      {
        at: [86, "20:31"],
        kind: "closed",
        actor: "paypal",
        title: "Closed: $56 refunded to the buyer, plus a $15 dispute fee",
      },
    ],
    closed: { outcome: "lost", at: [86, "20:31"], refunded: 5600 },
  },
  {
    id: "demo-unauth-won",
    disputeNumber: 46931,
    orderKey: "unauth-won",
    reason: "unauthorized",
    stage: "claim",
    status: "closed",
    opened: [110, "15:20"],
    buyerClaim: "I don't recognize this charge.",
    messages: [
      { from: "buyer", at: [110, "15:20"], text: "I don't recognize this charge." },
      {
        from: "paypal",
        at: [110, "15:21"],
        text: "The buyer says they didn't authorize this payment. Send proof that the order was shipped and delivered.",
      },
      {
        from: "paypal",
        at: [101, "18:00"],
        text: "We've decided this case in the seller's favor: the order shipped to the address on the payment and was delivered.",
      },
    ],
    events: [
      {
        at: [110, "15:20"],
        kind: "opened",
        actor: "buyer",
        title: "Victor Hale filed a claim: unauthorized payment",
      },
      {
        at: [109, "17:40"],
        kind: "evidence",
        actor: "seller",
        title: "You sent PayPal proof of fulfillment",
        detail: "USPS tracking to the address on the payment, with the delivery scan.",
      },
      { at: [101, "18:00"], kind: "decided", actor: "paypal", title: "PayPal ruled in your favor" },
      { at: [101, "18:01"], kind: "closed", actor: "paypal", title: "Closed: you kept $86" },
    ],
    closed: { outcome: "won", at: [101, "18:01"], refunded: 0 },
  },
];
