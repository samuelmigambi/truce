import type { Cents } from "./money";

/**
 * Wick & Ember, the demo shop: a made-up small candle maker. Its storefront, product pages and
 * policies are part of the app, so the agent can cite "the listing as the buyer saw it". Prices are
 * in cents. Each product's art is drawn from `art`, not photographed.
 */

export interface ShopInfo {
  name: string;
  tagline: string;
  city: string;
  email: string;
  address: { line1: string; city: string; state: string; postalCode: string; country: string };
}

export const SHOP: ShopInfo = {
  name: "Wick & Ember",
  tagline: "Small-batch candles, poured by hand in Portland, Oregon.",
  city: "Portland, Oregon",
  email: "hello@wickandember.example",
  address: {
    line1: "2140 SE Division St",
    city: "Portland",
    state: "OR",
    postalCode: "97202",
    country: "US",
  },
};

export type Vessel = "tin" | "jar" | "pillar" | "mug" | "box" | "tool";

export interface Product {
  id: string;
  slug: string;
  name: string;
  price: Cents;
  /** One line for the grid. */
  blurb: string;
  description: string;
  /** Stated plainly on the listing; the agent cites these lines. */
  details: { label: string; value: string }[];
  scentNotes: string[];
  art: { vessel: Vessel; wax: string; vesselColor: string; accent: string };
  stock: number;
}

export const PRODUCTS: Product[] = [
  {
    id: "p-cedar-smoke-trio",
    slug: "cedar-smoke-trio",
    name: "Cedar & Smoke candle trio",
    price: 8600,
    blurb: "Three travel tins of our best-selling woodsy blend.",
    description:
      "Three 4 oz tins of Cedar & Smoke: dry cedar, a curl of campfire smoke and a little vanilla to soften it. Made for gifting, or for keeping one in every room.",
    details: [
      { label: "Size", value: "Three 4 oz tins, each 2.9 in wide × 2 in tall (7.4 × 5 cm)" },
      { label: "Burn time", value: "About 25 hours per tin" },
      { label: "Wax", value: "Coconut and soy blend" },
      { label: "Wick", value: "Cotton, lead-free" },
    ],
    scentNotes: ["Cedarwood", "Campfire smoke", "Vanilla"],
    art: { vessel: "tin", wax: "#E9DFC9", vesselColor: "#B8BCB2", accent: "#4B5A3A" },
    stock: 24,
  },
  {
    id: "p-amber-glow-pillar",
    slug: "amber-glow-pillar",
    name: "Amber Glow pillar candle",
    price: 4200,
    blurb: "A hand-poured pillar with warm amber and clove.",
    description:
      "A small hand-poured pillar that glows from the inside as it burns. Warm amber, a pinch of clove and orange peel. Our photos are close-ups; please check the size below.",
    details: [
      { label: "Size", value: "3 in wide × 4 in tall (7.6 × 10 cm)" },
      { label: "Weight", value: "14 oz" },
      { label: "Burn time", value: "About 45 hours" },
      { label: "Wax", value: "Beeswax and soy blend" },
    ],
    scentNotes: ["Amber", "Clove", "Orange peel"],
    art: { vessel: "pillar", wax: "#E8A64B", vesselColor: "#E8A64B", accent: "#8A4B14" },
    stock: 15,
  },
  {
    id: "p-winter-grove-box",
    slug: "winter-grove-gift-box",
    name: "Winter Grove gift box",
    price: 12000,
    blurb: "Two large jars, a brass trimmer and long matches, boxed.",
    description:
      "Our holiday box: two 12 oz jars of Winter Grove (fir needle, juniper and a bright citrus top), a brass wick trimmer and a box of long matches, wrapped and ready to give.",
    details: [
      { label: "Includes", value: "Two 12 oz jars, a brass wick trimmer and 40 long matches" },
      { label: "Jar size", value: "3.4 in wide × 4.1 in tall (8.6 × 10.4 cm)" },
      { label: "Burn time", value: "About 70 hours per jar" },
      { label: "Box", value: "10 × 7 × 5 in, recycled board" },
    ],
    scentNotes: ["Fir needle", "Juniper", "Mandarin"],
    art: { vessel: "box", wax: "#EDE6D6", vesselColor: "#2F4A3A", accent: "#C9A85A" },
    stock: 9,
  },
  {
    id: "p-fig-linen",
    slug: "fig-and-linen",
    name: "Fig & Linen",
    price: 3200,
    blurb: "Green fig and clean cotton in an amber glass jar.",
    description:
      "Green fig leaves, fresh linen and a soft musk. Poured in an amber glass jar you can reuse when it's done.",
    details: [
      { label: "Size", value: "8 oz jar, 3 in wide × 3.5 in tall (7.6 × 8.9 cm)" },
      { label: "Burn time", value: "About 50 hours" },
      { label: "Wax", value: "Coconut and soy blend" },
    ],
    scentNotes: ["Green fig", "Linen", "Musk"],
    art: { vessel: "jar", wax: "#F1EBDD", vesselColor: "#9A5B25", accent: "#6E7F3C" },
    stock: 31,
  },
  {
    id: "p-salt-sea-moss",
    slug: "salt-and-sea-moss",
    name: "Salt & Sea Moss",
    price: 3800,
    blurb: "Sea salt, moss and driftwood, in a large clear jar.",
    description:
      "A walk on the Oregon coast: sea salt, damp moss and driftwood. Our biggest single jar.",
    details: [
      { label: "Size", value: "12 oz jar, 3.4 in wide × 4.1 in tall (8.6 × 10.4 cm)" },
      { label: "Burn time", value: "About 70 hours" },
      { label: "Wax", value: "Coconut and soy blend" },
    ],
    scentNotes: ["Sea salt", "Moss", "Driftwood"],
    art: { vessel: "jar", wax: "#EEF0E8", vesselColor: "#CFDCD6", accent: "#3E6B66" },
    stock: 20,
  },
  {
    id: "p-honey-tobacco",
    slug: "honey-and-tobacco",
    name: "Honey & Tobacco",
    price: 3200,
    blurb: "Raw honey, sweet tobacco leaf and a little oak.",
    description:
      "Raw honey, sweet tobacco leaf and toasted oak, for long evenings. Smoked glass jar.",
    details: [
      { label: "Size", value: "8 oz jar, 3 in wide × 3.5 in tall (7.6 × 8.9 cm)" },
      { label: "Burn time", value: "About 50 hours" },
      { label: "Wax", value: "Coconut and soy blend" },
    ],
    scentNotes: ["Honey", "Tobacco leaf", "Oak"],
    art: { vessel: "jar", wax: "#F0E2C4", vesselColor: "#4A4038", accent: "#C88A2E" },
    stock: 18,
  },
  {
    id: "p-ember-mug",
    slug: "ember-mug-candle",
    name: "Ember mug candle",
    price: 2800,
    blurb: "Poured in a stoneware mug you keep afterwards.",
    description:
      "Spiced chai poured into a hand-glazed stoneware mug. When the candle's done, wash it out and keep the mug. Each glaze is a little different.",
    details: [
      { label: "Size", value: "10 oz mug, 3.3 in wide × 3.7 in tall (8.4 × 9.4 cm)" },
      { label: "Burn time", value: "About 40 hours" },
      { label: "Note", value: "Stoneware is fragile; we pack each mug in recycled paper" },
    ],
    scentNotes: ["Chai", "Cardamom", "Black tea"],
    art: { vessel: "mug", wax: "#EADBC4", vesselColor: "#B4553B", accent: "#5A2E22" },
    stock: 12,
  },
  {
    id: "p-brass-trimmer",
    slug: "brass-wick-trimmer",
    name: "Brass wick trimmer",
    price: 1800,
    blurb: "Trim wicks to a quarter inch for a cleaner burn.",
    description:
      "Solid brass with a wide catch plate, so trimmings land on the tool, not in the wax.",
    details: [
      { label: "Size", value: "7 in long" },
      { label: "Material", value: "Solid brass" },
    ],
    scentNotes: [],
    art: { vessel: "tool", wax: "#C9A85A", vesselColor: "#C9A85A", accent: "#7A5E22" },
    stock: 40,
  },
];

export function productBySlug(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function productById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

/** The shop's policies, shown at /shop/policies; the agent cites them. */
export const POLICIES = {
  shipping: [
    "Orders ship within 1–2 business days from Portland, Oregon, by USPS Ground Advantage with tracking.",
    "We ship only to the address on your PayPal payment. To change it, update the address in PayPal before we ship.",
    "Tracking is added to your PayPal order as soon as the label is created.",
  ],
  returns: [
    "Unused candles can be returned within 30 days for a full refund; return shipping is on us.",
    "Burned candles can't be returned, unless they arrived damaged or not as described.",
    "If something arrives damaged, send us a photo within 7 days and we'll replace it or refund it.",
  ],
};
