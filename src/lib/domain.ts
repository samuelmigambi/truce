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
  "label_created" | "accepted" | "in_transit" | "out_for_delivery" | "delivered" | "exception";

/**
 * One carrier scan. There's no carrier API yet: the sample shop's scans are simulated (and
 * labelled), and real shops have the tracking number and status from their PayPal orders.
 */
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
  /** Where the scans came from: simulated in the sample shop, none yet for real shops. */
  scans?: "simulated" | "none";
  /** PayPal's own status for the tracker on a real shop's order, such as SHIPPED. */
  paypalStatus?: string;
  /** The day PayPal records it shipped, when it says. */
  shippedAt?: string | null;
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

// ---------- Accounts ----------

/** A person with a Truce account, signed in with Firebase Authentication. */
export interface User {
  uid: string;
  email: string;
  emailVerified: boolean;
  /** What Truce calls them; given at sign-up, changeable on the account page. */
  name: string;
  createdAt: string;
  updatedAt: string;
  /** The shop the app opens to. */
  lastShopId: string | null;
  onboarding: {
    /** The shop being set up right now, if any. */
    shopId: string | null;
  };
  /** Sessions issued before this moment are signed out ("sign out everywhere"). */
  sessionsValidAfter: string | null;
}

// ---------- Shops ----------

/**
 * A real shop connects its own PayPal app; everything in it is real. A sample shop holds the
 * Wick & Ember sample data, and its PayPal calls are simulated and labelled as such.
 */
export type ShopKind = "real" | "sample";

/** A shop reaches the app only once it's ready: set up, and synced once. */
export type ShopStatus = "setup" | "ready";

/** Onboarding's shop steps, in order. The account step lives on the user. */
export type SetupStep = "details" | "paypal" | "policies" | "notifications" | "review";

export const SETUP_STEPS: readonly SetupStep[] = [
  "details",
  "paypal",
  "policies",
  "notifications",
  "review",
];

/** Owners now; the model leaves room for teammates later. */
export type ShopRole = "owner" | "admin" | "member";

/** Currencies a shop can price in. Truce applies PayPal's US dispute rules to every shop. */
export type CurrencyCode = "USD" | "CAD" | "AUD" | "GBP" | "EUR";

export const CURRENCIES: readonly CurrencyCode[] = ["USD", "CAD", "AUD", "GBP", "EUR"];

/** What the seller tells Truce about the shop; the agent uses every field. */
export interface ShopProfile {
  name: string;
  /** The shop's public site, such as https://wickandember.com. Truce reads listings from it. */
  website: string | null;
  currency: CurrencyCode;
  /** An IANA zone, such as America/Los_Angeles: the shop's calendar days and times. */
  timeZone: string;
  /** What the shop sells, in the seller's words, such as "Hand-poured soy candles". */
  sells: string;
}

/** One policy: pasted text, a public page Truce reads, or both. Truce cites it to buyers. */
export interface PolicySource {
  text: string;
  url: string | null;
}

export interface ShopPolicies {
  shipping: PolicySource;
  returns: PolicySource;
}

/** Which events notify the seller: in the app now, and by email once delivery opens. */
export interface NotificationPrefs {
  newDisputes: boolean;
  buyerReplies: boolean;
  deadlines: boolean;
  /** How many days before PayPal's due date the deadline reminder comes. */
  deadlineDays: 1 | 2 | 3 | 5;
  decisions: boolean;
  /** Saved now; email delivery is coming, and the app says so. */
  email: boolean;
}

export interface ShopMember {
  uid: string;
  role: ShopRole;
  email: string;
  name: string;
  joinedAt: string;
  notifications: NotificationPrefs;
}

export type PayPalEnvironment = "sandbox" | "live";

/** What the shop's PayPal app can do, read from its OAuth token's scopes. */
export interface PayPalFeatures {
  /** Reading disputes. Truce needs it. */
  disputes: boolean;
  /** Answering disputes: messages, offers, evidence, refunds. Truce needs it to act. */
  respond: boolean;
  /** Transaction search, for the order history (and the claims ratio). */
  transactions: boolean;
  /** Adding tracking numbers to PayPal orders. */
  tracking: boolean;
  /** Registering webhooks on the app. */
  webhooks: boolean;
}

export interface PayPalWebhook {
  status: "registered" | "skipped" | "failed";
  id: string | null;
  url: string | null;
  /** Why it was skipped or failed, in plain words; null when registered. */
  note: string | null;
}

/** A shop's PayPal connection as the app shows it. The secret is never part of it. */
export interface PayPalConnection {
  environment: PayPalEnvironment;
  /** The REST app's client ID; public by design (PayPal's checkout buttons carry it). */
  clientId: string;
  /** SHA-256 of the client ID, to find the shops on one PayPal app. */
  clientIdHash: string;
  /** PayPal's ID for the REST app, from its token. */
  appId: string | null;
  features: PayPalFeatures;
  webhook: PayPalWebhook;
  connectedAt: string;
  /** When Truce last checked the keys with PayPal. */
  checkedAt: string;
  health: "ok" | "error";
  /** The last problem reaching PayPal, in plain words; null while healthy. */
  problem: string | null;
}

export interface Shop extends ShopProfile {
  id: string;
  kind: ShopKind;
  status: ShopStatus;
  /** The furthest setup step reached, so onboarding resumes there. */
  setupStep: SetupStep;
  policies: ShopPolicies;
  ownerUid: string;
  /** Everyone in the shop, by uid. */
  members: Record<string, ShopMember>;
  /** The same uids, for "which shops is this person in" queries. */
  memberIds: string[];
  /** Real shops only, once connected. */
  paypal: PayPalConnection | null;
  /**
   * Where the orders come from: "full" when Truce sees every sale (Transaction Search, or the
   * sample data), "disputes" when it only sees orders that have a dispute.
   */
  orderHistory: "full" | "disputes";
  createdAt: string;
  updatedAt: string;
  readyAt: string | null;
  lastSyncAt: string | null;
  lastSweepAt: string | null;
  /** Sample shops: the seed behind the data, and the moment its dates hang from. */
  seedVersion: string | null;
  seededAt: string | null;
}

export type NotificationKind =
  | "dispute_opened"
  | "buyer_reply"
  | "dispute_updated"
  | "decided"
  | "deadline"
  | "analysis"
  | "connection";

/** An in-app notification, shared by the shop's members; each member reads it separately. */
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  at: string;
  title: string;
  detail?: string;
  caseId?: string;
  /** The uids that have read it. */
  readBy: string[];
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

export type OrderStatus =
  "paid" | "label_created" | "shipped" | "delivered" | "refunded" | "partially_refunded";

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
  /** PayPal's dispute ID, such as "PP-R-QZF-10194831". The sample shop uses realistic made-up IDs. */
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
  /**
   * A real shop's case: what PayPal lets the seller do on the dispute right now, from its links
   * at the last sync ("provide_supporting_info", "accept_claim", "send_message"…). Missing in
   * the sample shop.
   */
  paypalActions?: string[];
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
  /** True when a PayPal call was simulated, in a sample shop. */
  simulated?: boolean;
}

// ---------- The agent's analysis ----------

export type EvidenceKind =
  "order" | "payment" | "tracking" | "listing" | "policy" | "message" | "photo" | "history";

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

export type AnalysisStepId =
  "triage" | "gather" | "protect" | "weigh" | "decide" | "draft" | "verify" | "similar";

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
