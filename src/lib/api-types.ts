import type {
  Analysis,
  AnalysisStepId,
  Case,
  CaseEvent,
  Draft,
  Move,
  Order,
  Workspace,
} from "./domain";
import type { Cents } from "./money";
import type { ProtectionResult } from "./rules/protection";

/**
 * The contract between the web app and its API routes. Every route returns JSON in these shapes,
 * or `{ error: string }` with a 4xx/5xx status. Streams (analysis, chat, sweep) are server-sent
 * events: one `data: <JSON>` line per event, as encoded by src/lib/sse.ts.
 */

export interface ApiError {
  error: string;
}

// GET /api/session (creates a demo copy when the visitor has none), POST /api/session/reset
export interface SessionResponse {
  workspace: Workspace;
}

/** A case as the inbox shows it. */
export interface CaseSummary extends Case {
  recommendation: { move: Move; confidence: "high" | "medium" | "low"; headline: string } | null;
  analyzed: boolean;
}

// GET /api/cases
export interface CasesResponse {
  cases: CaseSummary[];
}

// GET /api/cases/[id]
export interface CaseResponse {
  case: Case;
  order: Order | null;
  events: CaseEvent[];
  analysis: Analysis | null;
}

// POST /api/cases/[id]/approve
export interface ApproveRequest {
  move: Move;
  /** The draft as the seller approved it, possibly edited. */
  draft: Draft;
}

export interface ApproveResponse {
  case: Case;
  events: CaseEvent[];
  /** True in demo copies: the PayPal call was simulated and recorded. */
  simulated: boolean;
  paypal: { endpoint: string; status: number } | null;
}

/** An order with the before-shipping checks applied. */
export interface OrderWithChecks extends Order {
  checks: ProtectionResult;
  /** The case on this order, if any. */
  caseId: string | null;
}

// GET /api/orders
export interface OrdersResponse {
  orders: OrderWithChecks[];
}

// POST /api/orders/[id]/tracking
export interface AddTrackingRequest {
  carrier: "USPS" | "UPS" | "FEDEX" | "DHL";
  number: string;
}

export interface AddTrackingResponse {
  order: OrderWithChecks;
  simulated: boolean;
}

// GET /api/metrics
export interface Metrics {
  moneyAtRisk: Cents;
  openCases: number;
  dueSoon: number;
  /** Closed in the last 30 days. */
  kept: Cents;
  feesAvoided: Cents;
  feesPaid: Cents;
  ratio: { sales: number; claims: number; ratio: number; highVolume: boolean; headroom: number };
  /** Disputes per week by reason, oldest first, 13 weeks. */
  weekly: {
    weekStart: string;
    not_received: number;
    not_as_described: number;
    unauthorized: number;
    other: number;
  }[];
  /** Plain observations, such as "3 'not as described' claims this month mention size". */
  patterns: { text: string; caseIds: string[] }[];
  /** Model spend in this workspace. */
  spend: { model: string; calls: number; cost: number }[];
  averageCaseCost: number | null;
}

// GET /api/status
export interface StatusResponse {
  paypal: boolean;
  tokenFactory: boolean;
  tavily: boolean;
  store: "firestore" | "memory";
  models: { fast: string; draft: string; decide: string; embed: string };
}

// GET /api/shop/config
export interface ShopConfigResponse {
  /** PayPal's client ID is public by design; null when PayPal isn't connected. */
  clientId: string | null;
}

// POST /api/shop/orders
export interface ShopOrderRequest {
  /** What's in the bag; the server prices every line again from the catalog. */
  items: { productId: string; quantity: number }[];
}

export interface ShopOrderResponse {
  /** PayPal's order ID, for the PayPal buttons. */
  id: string;
  paypalOrderId: string;
  /** The shop's order number in the live workspace, such as "W-1045". */
  orderId: string;
}

// POST /api/shop/orders/[id]/capture, where [id] is PayPal's order ID
export interface CaptureResponse {
  /** The order number the visitor sees: in their demo copy, or the live one for the owner. */
  orderId: string;
  /** The same order's number in the live workspace. */
  liveOrderId: string;
  /** PayPal's capture status, such as COMPLETED or PENDING. */
  status: string;
  amount: Cents;
}

// POST /api/owner signs the owner in to the live sandbox (204), from the /owner#key=… page;
// DELETE /api/owner signs them out (204).
export interface OwnerSignInRequest {
  key: string;
}

// ---------- Streams ----------

/**
 * POST /api/cases/[id]/analyze streams these. A demo case analyzed before replays its recorded
 * run (the result says `replayed: true`); POST /api/cases/[id]/analyze?live=1 runs it again live,
 * within the day's limits.
 */
export type AnalysisEvent =
  | {
      type: "step";
      step: AnalysisStepId;
      state: "start" | "done" | "error";
      label: string;
      model?: string;
    }
  | { type: "tool"; id: string; label: string; state: "start" | "done" | "error" }
  | {
      type: "usage";
      step: AnalysisStepId;
      model: string;
      input: number;
      output: number;
      cached: number;
      cost: number | null;
    }
  | { type: "text"; step: AnalysisStepId; delta: string }
  | { type: "result"; analysis: Analysis; replayed: boolean }
  | { type: "error"; message: string };

/** POST /api/chat body. */
export interface ChatRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  /** The case on screen, if any. */
  caseId?: string | null;
}

/** A card the chat can show: a case, an order, or an action that waits for the seller's approval. */
export type ChatCard =
  | { kind: "case"; caseId: string }
  | { kind: "order"; orderId: string }
  | { kind: "action"; caseId: string; move: Move; draft: Draft; label: string }
  | { kind: "metric"; label: string; value: string };

/** POST /api/chat streams these. */
export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "tool-start"; id: string; name: string; label: string }
  | { type: "tool-end"; id: string; label: string; ok: boolean }
  | { type: "card"; card: ChatCard }
  | {
      type: "usage";
      model: string;
      input: number;
      output: number;
      cached: number;
      cost: number | null;
    }
  | { type: "error"; message: string };

/** POST /api/sweep streams these: the overnight check, run now. */
export type SweepEvent =
  | { type: "progress"; label: string; done: number; total: number }
  | { type: "case"; caseId: string; summary: string }
  | { type: "order"; orderId: string; ok: boolean; label: string }
  | { type: "usage"; model: string; cost: number | null }
  | { type: "done"; analyzed: number; flagged: number }
  | { type: "error"; message: string };
