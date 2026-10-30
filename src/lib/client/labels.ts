import type { ChatCard, ShopSummary } from "@/lib/api-types";
import type {
  AnalysisStepId,
  Case,
  CaseOutcome,
  CaseStatus,
  DisputeReason,
  DisputeStage,
  Move,
  OrderStatus,
  PayPalFeatures,
  PayPalWebhook,
  Shop,
  TrackingStatus,
} from "@/lib/domain";
import type { Urgency } from "@/lib/rules/deadlines";

/** The words the app uses for each code. Sentence case throughout. */

/** A shop in one chip: a sample shop, or a real one and how its PayPal stands. */
export interface ShopState {
  label: string;
  tone: "mist" | "outline" | "moss" | "warn";
  /** A sentence for a tooltip or a menu. */
  hint: string;
}

export function shopState(shop: Pick<ShopSummary, "kind" | "paypal">): ShopState {
  if (shop.kind === "sample") {
    return {
      label: "Sample shop",
      tone: "mist",
      hint: "Sample data. PayPal calls and carrier scans are simulated.",
    };
  }
  if (!shop.paypal) {
    return {
      label: "PayPal not connected",
      tone: "warn",
      hint: "Connect PayPal in settings so Truce can read and answer disputes.",
    };
  }
  if (shop.paypal.health === "error") {
    return {
      label: "PayPal needs attention",
      tone: "warn",
      hint: "Truce couldn't reach PayPal with this shop's keys. Check the connection in settings.",
    };
  }
  return shop.paypal.environment === "live"
    ? {
        label: "PayPal live",
        tone: "moss",
        hint: "Connected to PayPal. Approvals reach real buyers.",
      }
    : {
        label: "PayPal sandbox",
        tone: "outline",
        hint: "Connected to PayPal's sandbox, for testing. No real money moves.",
      };
}

/** What each PayPal permission lets Truce do, in the order settings lists them. */
export const PAYPAL_FEATURES: {
  key: keyof PayPalFeatures;
  label: string;
  does: string;
  required: boolean;
}[] = [
  { key: "disputes", label: "Read disputes", does: "Sees every dispute and claim", required: true },
  {
    key: "respond",
    label: "Answer disputes",
    does: "Sends messages, offers, evidence and refunds you approve",
    required: true,
  },
  {
    key: "transactions",
    label: "Transaction search",
    does: "Sees every order, for the checks before shipping and the claims ratio",
    required: false,
  },
  {
    key: "tracking",
    label: "Tracking",
    does: "Adds tracking numbers to PayPal orders",
    required: false,
  },
  {
    key: "webhooks",
    label: "Webhooks",
    does: "Hears about new disputes the moment PayPal does",
    required: false,
  },
];

export const WEBHOOK_STATUS: Record<PayPalWebhook["status"], string> = {
  registered: "Listening for PayPal's updates",
  skipped: "Not registered",
  failed: "Couldn't register",
};

/**
 * Why an approval in this shop can't reach PayPal right now, or null when it can. A sample shop
 * always can: its calls are simulated.
 */
export function sendBlocker(shop: Pick<Shop, "kind" | "paypal">): string | null {
  if (shop.kind === "sample") return null;
  if (!shop.paypal) return "Connect PayPal to send this. Truce can't reach the dispute without it.";
  if (shop.paypal.health === "error") {
    return "PayPal needs attention: Truce couldn't reach it with this shop's keys. Check the connection, then approve.";
  }
  if (!shop.paypal.features.respond) {
    return "This PayPal app can't answer disputes yet. Turn on its disputes permission, then check the connection.";
  }
  return null;
}

/** Why tracking can't be added to PayPal orders in this shop right now, or null when it can. */
export function trackingBlocker(shop: Pick<Shop, "kind" | "paypal">): string | null {
  if (shop.kind === "sample") return null;
  if (!shop.paypal) return "Connect PayPal to add tracking to its orders.";
  if (shop.paypal.health === "error") return "PayPal needs attention. Check the connection first.";
  if (!shop.paypal.features.tracking) {
    return "This PayPal app can't add tracking yet. Turn on its shipping permission, then check the connection.";
  }
  return null;
}

type CaseForCall = Pick<Case, "stage" | "status" | "paypalDisputeId" | "paypalActions">;

/**
 * The PayPal action a fight takes on a claim: evidence when PayPal still asks for it, else
 * supporting information for the reviewer. The dispute's own links decide when Truce has them.
 */
function claimAction(kase: CaseForCall): "provide_evidence" | "provide_supporting_info" {
  const allowed = kase.paypalActions;
  if (allowed?.includes("provide_evidence")) return "provide_evidence";
  if (allowed?.includes("provide_supporting_info")) return "provide_supporting_info";
  return kase.status === "with_paypal" ? "provide_supporting_info" : "provide_evidence";
}

/**
 * For a real shop's claim that PayPal is reviewing: the action PayPal still allows for this move
 * (supporting information or evidence for a fight, accepting the claim for a refund), from the
 * dispute's links at the last sync. Null otherwise, and always null in a sample shop.
 */
export function reviewAction(
  shop: Pick<Shop, "kind">,
  kase: CaseForCall,
  move: Move,
): "provide_evidence" | "provide_supporting_info" | "accept_claim" | null {
  if (shop.kind !== "real" || kase.status !== "with_paypal" || kase.stage === "inquiry")
    return null;
  const allowed = new Set(kase.paypalActions ?? []);
  if (move === "refund") return allowed.has("accept_claim") ? "accept_claim" : null;
  if (move !== "fight") return null;
  const action = claimAction(kase);
  return allowed.has(action) ? action : null;
}

/** The PayPal call an approval makes in a real shop, as the server makes it for this move. */
export function paypalCall(
  move: Move,
  kase: CaseForCall,
): {
  name: string;
  method: "POST";
  path: string;
} {
  const action =
    move === "refund"
      ? "accept_claim"
      : move === "settle"
        ? "make_offer"
        : kase.stage === "inquiry"
          ? "send_message"
          : claimAction(kase);
  const name = action.replace(/_/g, "-");
  return { name, method: "POST", path: `/v1/customer/disputes/${kase.paypalDisputeId}/${name}` };
}

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

export type ModelTier = "lightning" | "super" | "ultra" | "embed" | "code" | "other";

/** "Fight: tracking shows…" reads as "Tracking shows…" next to a move chip that already says Fight. */
export function headlineWithoutMove(headline: string): string {
  const rest = headline.replace(/^\s*(fight|settle|refund)\s*[:—–-]\s*/i, "");
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : headline;
}

const STATES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR".split(
    " ",
  ),
);

/**
 * Carrier scans arrive in capitals ("SACRAMENTO, CA 95814", "JACKSONVILLE FL DISTRIBUTION
 * CENTER"); show them in title case, with the state's code kept as it is.
 */
export function tidyPlace(place: string): string {
  if (place !== place.toUpperCase()) return place;
  return place
    .split(",")
    .map((part, i) => {
      const t = part.trim();
      if (i > 0 && /^[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/.test(t)) return t;
      return t
        .split(" ")
        .map((word, w) =>
          w > 0 && STATES.has(word) ? word : word.charAt(0) + word.slice(1).toLowerCase(),
        )
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
