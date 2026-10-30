import type {
  Analysis,
  AnalysisStepId,
  AppNotification,
  Case,
  CaseEvent,
  CaseStatus,
  DisputeReason,
  Draft,
  Move,
  NotificationPrefs,
  Order,
  PayPalEnvironment,
  SetupStep,
  Shop,
  ShopKind,
  ShopPolicies,
  ShopProfile,
  ShopRole,
  ShopStatus,
  User,
} from "./domain";
import type { ChatSummary, ChatThread } from "./chat-thread";
import type { Cents } from "./money";
import type { ProtectionResult } from "./rules/protection";

/**
 * The contract between the web app and its API routes. Every route returns JSON in these shapes,
 * or an ApiError with a 4xx/5xx status. Streams (analysis, chat, sweep, sync) are server-sent
 * events: one `data: <JSON>` line per event, as encoded by src/lib/sse.ts.
 *
 * Everything about a shop lives under /api/shops/[shopId]/…, and every one of those routes
 * checks on the server that the signed-in person is a member of that shop.
 */

export interface ApiError {
  error: string;
  /** A stable code for errors the app handles specially, such as "paypal_missing_features". */
  code?: string;
  /** Per-field messages for forms, keyed by the field's path ("profile.website"). */
  fields?: Record<string, string>;
}

// ---------- Sign-in ----------

/** GET /api/auth/config: Firebase's web config, which is public, read at runtime. */
export interface AuthConfigResponse {
  /** Null when Firebase isn't set up on this server. */
  firebase: { apiKey: string; authDomain: string; projectId: string; appId: string | null } | null;
  /** The Auth emulator's address in local development ("127.0.0.1:9099"), or null. */
  emulator: string | null;
  /** Whether "Continue with Google" is offered. */
  google: boolean;
}

/** POST /api/auth/session: trades a fresh Firebase ID token for the session cookie. */
export interface SessionRequest {
  idToken: string;
}

export interface SessionResponse {
  user: User;
  /** Where to go next: onboarding, or the shop the app opens to. */
  next: string;
}

// DELETE /api/auth/session signs this browser out (204).
// POST /api/auth/sign-out-everywhere ends every session of this account (204).

// ---------- The account ----------

/** A shop as the switcher lists it. */
export interface ShopSummary {
  id: string;
  name: string;
  kind: ShopKind;
  status: ShopStatus;
  setupStep: SetupStep;
  role: ShopRole;
  paypal: { environment: PayPalEnvironment; health: "ok" | "error" } | null;
}

/** GET /api/me (`?refresh=1` re-checks email verification with Firebase). */
export interface MeResponse {
  user: User;
  shops: ShopSummary[];
}

/** PATCH /api/me */
export interface UpdateMeRequest {
  name: string;
}

// ---------- Shops ----------

/** POST /api/shops: a real shop starts at its details; a sample shop is made whole. */
export type CreateShopRequest = { kind: "real"; profile: ShopProfile } | { kind: "sample" };

/** GET /api/shops/[shopId], and the answer to most shop changes. */
export interface ShopResponse {
  shop: Shop;
  role: ShopRole;
}

/** PATCH /api/shops/[shopId]: any of these parts. `notifications` are the caller's own. */
export interface UpdateShopRequest {
  profile?: ShopProfile;
  policies?: ShopPolicies;
  notifications?: NotificationPrefs;
  /** Onboarding: the step the seller moved on to. Never moves a shop backwards. */
  setupStep?: SetupStep;
}

// DELETE /api/shops/[shopId] deletes the shop and everything in it (owner only, 204).
// POST /api/shops/[shopId]/sample/reset starts a sample shop over (ShopResponse).

// ---------- PayPal ----------

/** POST /api/shops/[shopId]/paypal: connects, or reconnects, the shop's PayPal REST app. */
export interface ConnectPayPalRequest {
  environment: PayPalEnvironment;
  clientId: string;
  clientSecret: string;
}

/**
 * The connection, plus plain notes on what's missing or skipped. A refused connection is an
 * ApiError instead: 422 with code "paypal_rejected_keys" or "paypal_missing_features".
 */
export interface ConnectPayPalResponse {
  shop: Shop;
  notes: string[];
}

// POST /api/shops/[shopId]/paypal/check checks the keys again (ConnectPayPalResponse).
// DELETE /api/shops/[shopId]/paypal disconnects: removes the webhook and the keys (ShopResponse).

/** POST /api/shops/[shopId]/sync streams these: the first sync, or "Sync now". */
export type SyncStepId = "paypal" | "disputes" | "orders" | "history" | "sort" | "analysis";

export type SyncEvent =
  | {
      type: "step";
      step: SyncStepId;
      state: "start" | "done" | "error" | "skipped";
      label: string;
      /** A second line, such as why a step was skipped. */
      detail?: string;
    }
  | { type: "progress"; step: SyncStepId; done: number; total: number }
  /** A dispute found, as it arrives. */
  | {
      type: "case";
      caseId: string;
      buyer: string;
      amount: Cents;
      reason: DisputeReason;
      status: CaseStatus;
      itemSummary: string;
    }
  /** The first analysis, streamed as it runs: its own events, wrapped. */
  | { type: "analysis"; caseId: string; event: AnalysisEvent }
  | {
      type: "done";
      shop: Shop;
      cases: number;
      orders: number;
      /** The case Truce analyzed during the sync, if any. */
      analyzedCaseId: string | null;
    }
  | { type: "error"; message: string };

// ---------- Notifications ----------

/** GET /api/shops/[shopId]/notifications: the newest first. */
export interface NotificationsResponse {
  notifications: AppNotification[];
  /** Unread by the signed-in member. */
  unread: number;
}

/** POST /api/shops/[shopId]/notifications/read: these, or every one when `ids` is missing (204). */
export interface ReadNotificationsRequest {
  ids?: string[];
}

// ---------- Cases ----------

/** A case as the inbox shows it. */
export interface CaseSummary extends Case {
  recommendation: { move: Move; confidence: "high" | "medium" | "low"; headline: string } | null;
  analyzed: boolean;
}

// GET /api/shops/[shopId]/cases
export interface CasesResponse {
  cases: CaseSummary[];
}

// GET /api/shops/[shopId]/cases/[caseId]
export interface CaseResponse {
  case: Case;
  order: Order | null;
  events: CaseEvent[];
  analysis: Analysis | null;
}

// POST /api/shops/[shopId]/cases/[caseId]/approve
export interface ApproveRequest {
  move: Move;
  /** The draft as the seller approved it, possibly edited. */
  draft: Draft;
}

export interface ApproveResponse {
  case: Case;
  events: CaseEvent[];
  /** True in a sample shop: the PayPal call was simulated and recorded. */
  simulated: boolean;
  paypal: { endpoint: string; status: number } | null;
}

// ---------- Orders ----------

/** An order with the before-shipping checks applied. */
export interface OrderWithChecks extends Order {
  checks: ProtectionResult;
  /** The case on this order, if any. */
  caseId: string | null;
}

// GET /api/shops/[shopId]/orders
export interface OrdersResponse {
  orders: OrderWithChecks[];
  /** "disputes" when only orders with a dispute are known (Transaction Search is off). */
  history: Shop["orderHistory"];
}

// POST /api/shops/[shopId]/orders/[orderId]/tracking
export interface AddTrackingRequest {
  carrier: "USPS" | "UPS" | "FEDEX" | "DHL";
  number: string;
}

export interface AddTrackingResponse {
  order: OrderWithChecks;
  simulated: boolean;
}

// ---------- Shop health ----------

// GET /api/shops/[shopId]/metrics
export interface Metrics {
  moneyAtRisk: Cents;
  openCases: number;
  dueSoon: number;
  /** Closed in the last 30 days. */
  kept: Cents;
  feesAvoided: Cents;
  feesPaid: Cents;
  ratio: {
    sales: number;
    claims: number;
    ratio: number;
    highVolume: boolean;
    headroom: number;
    /** False when the shop's sales aren't known (no order history), so there's no ratio. */
    known: boolean;
  };
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
  /** Model spend in this shop. */
  spend: { model: string; calls: number; cost: number }[];
  averageCaseCost: number | null;
}

// ---------- The server ----------

// GET /api/status: which services this server has. Never the keys.
export interface StatusResponse {
  tokenFactory: boolean;
  tavily: boolean;
  store: "firestore" | "memory";
  /** Firebase Authentication is set up. */
  auth: boolean;
  /** Truce can encrypt PayPal keys (TRUCE_ENCRYPTION_KEY is set). */
  encryption: boolean;
  /** The demo storefront's own PayPal app (sandbox) is set up. */
  storefront: boolean;
  /** Whether the site's address is public, so PayPal webhooks and page reads can reach it. */
  publicSite: boolean;
  models: { fast: string; draft: string; decide: string; embed: string };
}

// ---------- The demo storefront (/shop) ----------

// GET /api/shop/config
export interface ShopConfigResponse {
  /** PayPal's client ID is public by design; null when the storefront's PayPal isn't set up. */
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
  /** The storefront's order number, such as "W-1045". */
  orderId: string;
}

// POST /api/shop/orders/[id]/capture, where [id] is PayPal's order ID
export interface CaptureResponse {
  /** The storefront's order number. */
  orderId: string;
  /** PayPal's capture status, such as COMPLETED or PENDING. */
  status: string;
  amount: Cents;
}

// ---------- Streams ----------

/**
 * POST /api/shops/[shopId]/cases/[caseId]/analyze streams these. A sample shop's case analyzed
 * before replays its recorded run (the result says `replayed: true`); `?live=1` runs it again
 * live, within the day's limits. Real shops always run live.
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

/** POST /api/shops/[shopId]/chat body. */
export interface ChatRequest {
  messages: { role: "user" | "assistant"; content: string }[];
  /** The case on screen, if any. */
  caseId?: string | null;
  /** The saved chat this question continues; none starts a new one. */
  chatId?: string | null;
}

/** GET /api/shops/[shopId]/chats: this person's saved chats in the shop, newest first. */
export interface ChatsResponse {
  chats: ChatSummary[];
}

/** PATCH /api/shops/[shopId]/chats/[chatId]: a new name for the chat. */
export interface RenameChatRequest {
  title: string;
}

/** GET /api/shops/[shopId]/chats/[chatId]: one saved chat with its messages. */
export interface ChatResponse {
  chat: ChatThread;
}

/** A card the chat can show: a case, an order, or an action that waits for the seller's approval. */
export type ChatCard =
  | { kind: "case"; caseId: string }
  | { kind: "order"; orderId: string }
  | { kind: "action"; caseId: string; move: Move; draft: Draft; label: string }
  | { kind: "metric"; label: string; value: string };

/** POST /api/shops/[shopId]/chat streams these. */
export type ChatEvent =
  /** First, always: the saved chat this answer belongs to, new or continued. */
  | { type: "chat"; id: string; title: string }
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

/** POST /api/shops/[shopId]/sweep streams these: the overnight check, run now. */
export type SweepEvent =
  | { type: "progress"; label: string; done: number; total: number }
  | { type: "case"; caseId: string; summary: string }
  | { type: "order"; orderId: string; ok: boolean; label: string }
  | { type: "usage"; model: string; cost: number | null }
  | { type: "done"; analyzed: number; flagged: number }
  | { type: "error"; message: string };
