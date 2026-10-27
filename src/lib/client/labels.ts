import type { ChatCard } from "@/lib/api-types";
import type {
  AnalysisStepId,
  CaseOutcome,
  CaseStatus,
  DisputeReason,
  DisputeStage,
  EvidenceKind,
  Move,
  OrderStatus,
  TrackingStatus,
} from "@/lib/domain";
import type { Urgency } from "@/lib/rules/deadlines";

/** The words the app uses for each code. Sentence case throughout. */

export const REASON: Record<DisputeReason, string> = {
  not_received: "Not received",
  not_as_described: "Not as described",
  unauthorized: "Unauthorized",
  other: "Other",
};

export const STAGE: Record<DisputeStage, string> = {
  inquiry: "Inquiry",
  claim: "Claim",
  chargeback: "Chargeback",
};

export const STATUS: Record<CaseStatus, string> = {
  needs_you: "Needs you",
  waiting_buyer: "Waiting on buyer",
  with_paypal: "With PayPal",
  closed: "Closed",
};

export const MOVE: Record<Move, string> = {
  fight: "Fight",
  settle: "Settle",
  refund: "Refund",
};

/** What each move means, in one line. */
export const MOVE_HINT: Record<Move, string> = {
  fight: "Answer with the evidence",
  settle: "Offer a partial refund",
  refund: "Refund in full",
};

export const OUTCOME: Record<CaseOutcome, string> = {
  won: "Won",
  lost: "Lost",
  settled: "Settled",
  refunded: "Refunded",
  buyer_closed: "Buyer closed it",
};

export const ORDER_STATUS: Record<OrderStatus, string> = {
  paid: "To ship",
  label_created: "Label created",
  shipped: "Shipped",
  delivered: "Delivered",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
};

export const EVIDENCE_KIND: Record<EvidenceKind, string> = {
  order: "Order",
  payment: "Payment",
  tracking: "Tracking",
  listing: "Listing",
  policy: "Policy",
  message: "Message",
  photo: "Photo",
  history: "History",
};

export const TRACKING_STATUS: Record<TrackingStatus, string> = {
  label_created: "Label created",
  accepted: "Accepted",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  exception: "Delivery exception",
};

export const URGENCY_TONE: Record<Urgency, "risk" | "warn" | "neutral"> = {
  overdue: "risk",
  today: "risk",
  soon: "warn",
  later: "neutral",
};

/** The analysis pipeline, in the order it runs. */
export const STEPS: { id: AnalysisStepId; label: string; hint: string }[] = [
  {
    id: "triage",
    label: "Read the case",
    hint: "Sums up what the buyer says and how urgent it is",
  },
  {
    id: "gather",
    label: "Gather evidence",
    hint: "The order, payment, tracking, listing, policies, messages and photos",
  },
  { id: "protect", label: "Check Seller Protection", hint: "PayPal's rules, checked in code" },
  {
    id: "weigh",
    label: "Weigh the moves",
    hint: "What fighting, settling or refunding would cost",
  },
  {
    id: "decide",
    label: "Decide",
    hint: "Fight, settle or refund, with reasons that cite the evidence",
  },
  {
    id: "draft",
    label: "Draft the reply",
    hint: "Writes the response and reads the buyer's photos",
  },
  { id: "verify", label: "Check the draft", hint: "Every sentence against the evidence" },
  { id: "similar", label: "Find similar cases", hint: "Closed cases like this one" },
];

export const STEP_LABEL = Object.fromEntries(STEPS.map((s) => [s.id, s.label])) as Record<
  AnalysisStepId,
  string
>;

/** Steps done by plain code, not a model. */
export const CODE_STEPS: ReadonlySet<string> = new Set(["protect"]);

export type ModelTier = "lightning" | "super" | "ultra" | "embed" | "code" | "other";

export function modelTier(model: string | undefined | null): ModelTier {
  if (!model) return "code";
  if (/lightning/i.test(model)) return "lightning";
  if (/super/i.test(model)) return "super";
  if (/ultra/i.test(model)) return "ultra";
  if (/embed/i.test(model)) return "embed";
  if (/^(code|rules)$/i.test(model)) return "code";
  return "other";
}

/** "Lightning", "Super VL", "Ultra": the short names the app shows. */
export function shortModelName(model: string | undefined | null): string {
  switch (modelTier(model)) {
    case "lightning":
      return "Lightning";
    case "super":
      return "Super VL";
    case "ultra":
      return "Ultra";
    case "embed":
      return "Qwen3 embeddings";
    case "code":
      return "Plain code";
    default:
      return model?.split("/").pop() ?? "Model";
  }
}

/** "Nemotron 3.5 Lightning" and so on: the full family name. */
export function fullModelName(model: string | undefined | null): string {
  if (!model) return "Plain code";
  const tier = modelTier(model);
  if (tier === "lightning" || tier === "super" || tier === "ultra") {
    const version = model.match(/Nemotron-(\d+(?:[._]\d+)?)/i)?.[1]?.replace("_", ".");
    return `Nemotron${version ? ` ${version}` : ""} ${shortModelName(model)}`;
  }
  if (tier === "embed") return "Qwen3 Embedding 8B";
  return model.split("/").pop() ?? model;
}

/** What each job does, for Settings and the landing page. */
export const JOBS: { job: "fast" | "draft" | "decide" | "embed"; title: string; does: string }[] = [
  { job: "fast", title: "Sorts", does: "Reads each case, sums it up and gathers the records" },
  {
    job: "draft",
    title: "Drafts and reads photos",
    does: "Writes replies, looks at buyer photos and answers in Ask Truce",
  },
  {
    job: "decide",
    title: "Decides and checks",
    does: "Makes the fight, settle or refund call and checks every draft",
  },
  { job: "embed", title: "Remembers", does: "Finds closed cases like the one in front of you" },
];

/** "Fight: tracking shows…" reads as "Tracking shows…" next to a move chip that already says Fight. */
export function headlineWithoutMove(headline: string): string {
  const rest = headline.replace(/^\s*(fight|settle|refund)\s*[:—–-]\s*/i, "");
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : headline;
}

/** Carrier scans arrive in capitals ("SACRAMENTO, CA 95814"); show them in title case. */
export function tidyPlace(place: string): string {
  if (place !== place.toUpperCase()) return place;
  return place
    .split(",")
    .map((part, i) => {
      const t = part.trim();
      if (i > 0 && /^[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/.test(t)) return t;
      return t
        .toLowerCase()
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    })
    .join(", ");
}

/** A card's short title, for chat. */
export function cardTitle(card: ChatCard): string {
  switch (card.kind) {
    case "case":
      return `Case ${card.caseId}`;
    case "order":
      return `Order ${card.orderId}`;
    case "action":
      return card.label;
    case "metric":
      return card.label;
  }
}
