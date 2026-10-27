import type { Cents } from "./money";
import type { Urgency } from "./rules/deadlines";
import type { Evidence, MoveCost } from "./rules/options";
import type { ProtectionResult } from "./rules/protection";

/** Why the buyer opened the dispute, from PayPal's reason codes. */
export type DisputeReason = "not_received" | "not_as_described" | "unauthorized" | "other";

/** Where the dispute stands: a conversation (inquiry), a claim PayPal decides, or a card chargeback. */
export type DisputeStage = "inquiry" | "claim" | "chargeback";

/** What the seller can do about a case. */
export type Move = "fight" | "settle" | "refund";

/** PayPal's Seller Protection verdict on a captured payment. */
export type ProtectionStatus = "ELIGIBLE" | "PARTIALLY_ELIGIBLE" | "NOT_ELIGIBLE";

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export type TrackingStatus =
  | "label_created"
  | "accepted"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "exception";

/** One carrier scan. In the demo, carrier scans are simulated; PayPal records are real. */
export interface TrackingEvent {
  at: string;
  status: TrackingStatus;
  location: string;
  detail: string;
}

export interface Tracking {
  carrier: string;
  number: string;
  /** Sent to PayPal with the order's capture. */
  uploaded: boolean;
  deliveredAt: string | null;
  signedFor: boolean;
  events?: TrackingEvent[];
}

/** The facts of one order that the rules need. */
export interface OrderFacts {
  amount: Cents;
  protection: ProtectionStatus | null;
  /** The address on PayPal's Transaction Details page. */
  paypalAddress: Address | null;
  /** Where the label sends it. */
  shipTo: Address | null;
  tracking: Tracking | null;
}

// ---------- Workspaces ----------

/**
 * A demo workspace is a visitor's private copy of the demo shop: the agent runs for real, and
 * PayPal calls are simulated. The live workspace is connected to the PayPal sandbox for real.
 */
export type WorkspaceKind = "demo" | "live";

export interface Workspace {
  id: string;
  kind: WorkspaceKind;
  shopName: string;
  createdAt: string;
  /** Demo copies expire; the live workspace doesn't. */
  expiresAt: string | null;
  lastSweepAt: string | null;
  seedVersion: string | null;
}

// ---------- Orders ----------

export interface Buyer {
  name: string;
  email: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: Cents;
}

export type OrderStatus = "paid" | "label_created" | "shipped" | "delivered" | "refunded" | "partially_refunded";

export interface Order extends OrderFacts {
  /** The shop's order number, such as "W-1042". */
  id: string;
  paypalOrderId: string | null;
  captureId: string | null;
  buyer: Buyer;
  items: OrderItem[];
  placedAt: string;
  status: OrderStatus;
  /** A buyer's note at checkout, such as a request to ship elsewhere. */
  note?: string;
}

// ---------- Cases ----------

/** Where a case sits in the seller's inbox. */
export type CaseStatus = "needs_you" | "waiting_buyer" | "with_paypal" | "closed";

export type CaseOutcome = "won" | "lost" | "settled" | "refunded" | "buyer_closed";

export interface CaseMessage {
  id: string;
  from: "buyer" | "seller" | "paypal";
  at: string;
  text: string;
}

export interface CasePhoto {
  /** A public path such as /demo/photos/amber-glow-ruler.png */
  url: string;
  caption: string;
}

export interface Case {
  id: string;
  /** PayPal's dispute ID, such as "PP-R-QZF-10194831". Demo copies use realistic made-up IDs. */
  paypalDisputeId: string;
  orderId: string;
  reason: DisputeReason;
  stage: DisputeStage;
  status: CaseStatus;
  amount: Cents;
  buyer: Buyer;
  itemSummary: string;
  openedAt: string;
  /** PayPal's seller_response_due_date, when there is one. */
  dueAt: string | null;
  /** The buyer's own words when opening the case. */
  buyerClaim: string;
  messages: CaseMessage[];
  photos: CasePhoto[];
  outcome: CaseOutcome | null;
  closedAt: string | null;
  /** Filled in when the case closes: what the seller kept, paid in fees, and avoided in fees. */
  moneyKept: Cents;
  feeCharged: Cents;
  feeAvoided: Cents;
  updatedAt: string;
}

export type CaseEventKind =
  | "opened"
  | "message"
  | "analysis"
  | "approved"
  | "sent"
  | "evidence"
  | "offer"
  | "buyer_reply"
  | "escalated"
  | "decided"
  | "closed"
  | "note";

export interface CaseEvent {
  id: string;
  at: string;
  kind: CaseEventKind;
  actor: "buyer" | "seller" | "truce" | "paypal";
  title: string;
  detail?: string;
  /** True when a PayPal call was simulated in a demo copy. */
  simulated?: boolean;
}

// ---------- The agent's analysis ----------

export type EvidenceKind = "order" | "payment" | "tracking" | "listing" | "policy" | "message" | "photo" | "history";

/** A record the agent may cite. Every sentence in a draft points to one or more of these IDs. */
export interface EvidenceRecord {
  /** Short and stable, such as "E1". */
  id: string;
  kind: EvidenceKind;
  title: string;
  summary: string;
  /** Where it came from: "PayPal capture 4P6…", "USPS 9400…", a URL. */
  source: string;
  at?: string;
}

export interface Recommendation {
  move: Move;
  confidence: "high" | "medium" | "low";
  /** One plain sentence, such as "Fight: tracking shows it was delivered to the PayPal address." */
  headline: string;
  reasons: { text: string; evidence: string[] }[];
  /** For "settle": the partial refund to offer. */
  offerAmount?: Cents;
}

export interface Draft {
  kind: "message" | "offer" | "evidence" | "refund";
  /** What goes to the buyer or to PayPal. */
  text: string;
  evidenceIds: string[];
  offerAmount?: Cents;
  /** For evidence: PayPal's evidence_type, such as PROOF_OF_FULFILLMENT. */
  evidenceType?: string;
}

export interface Verification {
  ok: boolean;
  checked: { sentence: string; evidence: string[]; supported: boolean }[];
  notes: string;
}

export type AnalysisStepId = "triage" | "gather" | "protect" | "weigh" | "decide" | "draft" | "verify" | "similar";

/** The model behind one step, and what it cost: shown in the case file. */
export interface ModelStep {
  step: AnalysisStepId | "chat" | "sweep";
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  /** Dollars; null when the model's price is unknown. */
  cost: number | null;
  ms: number;
}

export interface SimilarCase {
  caseId: string;
  similarity: number;
  outcome: CaseOutcome | null;
  summary: string;
}

export interface Analysis {
  caseId: string;
  createdAt: string;
  /** Bumped when prompts change, so cached analyses are redone. */
  promptVersion: string;
  triage: { summary: string; urgency: Urgency };
  evidence: EvidenceRecord[];
  protection: ProtectionResult;
  evidenceStrength: Evidence;
  options: MoveCost[];
  recommendation: Recommendation;
  draft: Draft;
  verification: Verification;
  similar: SimilarCase[];
  steps: ModelStep[];
  totalCost: number;
}
