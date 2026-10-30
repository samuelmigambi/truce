/** The parts of PayPal's REST payloads that Truce reads or sends. Field names follow PayPal's. */

export interface Money {
  currency_code: string;
  value: string;
}

export interface PayPalAddress {
  address_line_1?: string;
  address_line_2?: string;
  /** City. */
  admin_area_2?: string;
  /** State. */
  admin_area_1?: string;
  postal_code?: string;
  country_code: string;
}

export interface CreateOrder {
  intent: "CAPTURE";
  purchase_units: {
    reference_id?: string;
    custom_id?: string;
    description?: string;
    amount: Money & { breakdown?: { item_total: Money; shipping?: Money } };
    items?: { name: string; quantity: string; unit_amount: Money; sku?: string }[];
    shipping?: { name?: { full_name: string }; address?: PayPalAddress };
  }[];
  payment_source?: Record<string, unknown>;
}

export interface Capture {
  id: string;
  status: string;
  amount: Money;
  seller_protection?: {
    status: "ELIGIBLE" | "PARTIALLY_ELIGIBLE" | "NOT_ELIGIBLE";
    dispute_categories?: string[];
  };
  create_time?: string;
}

export interface Order {
  id: string;
  status: string;
  create_time?: string;
  purchase_units?: {
    reference_id?: string;
    custom_id?: string;
    invoice_id?: string;
    amount?: Money;
    items?: { name: string; quantity: string; unit_amount?: Money; sku?: string }[];
    shipping?: {
      name?: { full_name: string };
      address?: PayPalAddress;
      trackers?: { id: string; status?: string }[];
    };
    payments?: { captures?: Capture[] };
  }[];
  payer?: { email_address?: string; name?: { given_name?: string; surname?: string } };
  links?: Link[];
}

export interface AddTracking {
  capture_id: string;
  tracking_number: string;
  /** A carrier code such as USPS, UPS, FEDEX or DHL. */
  carrier: string;
  notify_payer?: boolean;
}

export interface Link {
  href: string;
  rel: string;
  method?: string;
}

export interface LinkResponse {
  links?: Link[];
}

export type DisputeReasonCode =
  | "MERCHANDISE_OR_SERVICE_NOT_RECEIVED"
  | "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED"
  | "UNAUTHORISED"
  | "CREDIT_NOT_PROCESSED"
  | "DUPLICATE_TRANSACTION"
  | "INCORRECT_AMOUNT"
  | "PAYMENT_BY_OTHER_MEANS"
  | "CANCELED_RECURRING_BILLING"
  | "PROBLEM_WITH_REMITTANCE"
  | "OTHER";

export type DisputeStatus =
  | "OPEN"
  | "WAITING_FOR_BUYER_RESPONSE"
  | "WAITING_FOR_SELLER_RESPONSE"
  | "UNDER_REVIEW"
  | "RESOLVED"
  | "OTHER";

export type LifeCycleStage = "INQUIRY" | "CHARGEBACK" | "PRE_ARBITRATION" | "ARBITRATION";

export interface DisputeMessage {
  posted_by: "BUYER" | "SELLER" | "ARBITER";
  time_posted: string;
  content?: string;
}

export interface DisputedTransaction {
  buyer_transaction_id?: string;
  seller_transaction_id?: string;
  reference_id?: string;
  create_time?: string;
  transaction_status?: string;
  gross_amount?: Money;
  invoice_number?: string;
  custom?: string;
  buyer?: { name?: string; email?: string };
}

export interface DisputeSummary {
  dispute_id: string;
  reason: DisputeReasonCode;
  status: DisputeStatus;
  dispute_state?: string;
  dispute_life_cycle_stage?: LifeCycleStage;
  dispute_channel?: "INTERNAL" | "EXTERNAL" | "ALERT";
  dispute_amount: Money;
  create_time: string;
  update_time: string;
  links?: Link[];
}

export interface Dispute extends DisputeSummary {
  seller_response_due_date?: string;
  buyer_response_due_date?: string;
  disputed_transactions?: DisputedTransaction[];
  messages?: DisputeMessage[];
  offer?: {
    buyer_requested_amount?: Money;
    seller_offered_amount?: Money;
    offer_type?: string;
  };
  dispute_outcome?: { outcome_code?: string; amount_refunded?: Money };
  allowed_response_options?: Record<string, unknown>;
}

export interface DisputeList {
  items?: DisputeSummary[];
  links?: Link[];
}

export interface ListDisputes {
  states?: (
    | "REQUIRED_ACTION"
    | "REQUIRED_OTHER_PARTY_ACTION"
    | "UNDER_PAYPAL_REVIEW"
    | "RESOLVED"
    | "OPEN_INQUIRIES"
    | "APPEALABLE"
  )[];
  createdAfter?: string;
  page?: number;
  pageSize?: number;
}

export interface MakeOffer {
  note: string;
  offer_type:
    "REFUND" | "REFUND_WITH_RETURN" | "REFUND_WITH_REPLACEMENT" | "REPLACEMENT_WITHOUT_REFUND";
  offer_amount?: Money;
}

export interface Evidence {
  evidence_type: string;
  evidence_info?: {
    tracking_info?: {
      carrier_name: string;
      carrier_name_other?: string;
      tracking_number: string;
    }[];
    refund_ids?: { refund_id: string }[];
  };
  notes?: string;
}

export interface ProvideEvidence {
  evidences: Evidence[];
}

export interface EvidenceFile {
  name: string;
  type: "image/jpeg" | "image/png" | "image/gif" | "application/pdf";
  bytes: Uint8Array;
}

export interface AcceptClaim {
  note: string;
  accept_claim_type?: "REFUND" | "REFUND_WITH_RETURN" | "PARTIAL_REFUND";
  refund_amount?: Money;
}

/** GET /v2/payments/captures/{id}: the payment, its protection, and the order it belongs to. */
export interface CaptureDetails extends Capture {
  invoice_id?: string;
  custom_id?: string;
  supplementary_data?: { related_ids?: { order_id?: string } };
}

/** A shipping tracker on a payment, from /v1/shipping/trackers. */
export interface Tracker {
  transaction_id: string;
  tracking_number: string;
  status: string;
  carrier?: string;
  carrier_name_other?: string;
  shipment_date?: string;
}

export interface NewTracker {
  transaction_id: string;
  tracking_number: string;
  status: "SHIPPED";
  carrier: string;
  notify_buyer?: boolean;
}

export interface TrackerBatch {
  tracker_identifiers?: { transaction_id: string; tracking_number: string }[];
  errors?: { name?: string; message?: string; details?: unknown }[];
}

export interface TransactionQuery {
  /** ISO 8601 with an offset, such as 2026-10-01T00:00:00-0000. */
  startDate: string;
  endDate: string;
  page?: number;
  pageSize?: number;
}

/** One transaction as Transaction Search lists it (only the fields Truce reads). */
export interface Transaction {
  transaction_info: {
    transaction_id: string;
    transaction_event_code?: string;
    transaction_initiation_date?: string;
    transaction_amount?: Money;
    transaction_status?: string;
    invoice_id?: string;
    custom_field?: string;
    paypal_reference_id?: string;
  };
  payer_info?: {
    email_address?: string;
    payer_name?: { given_name?: string; surname?: string; alternate_full_name?: string };
  };
  shipping_info?: {
    name?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country_code?: string;
    };
  };
  cart_info?: {
    item_details?: { item_name?: string; item_quantity?: string; item_unit_price?: Money }[];
  };
}

export interface TransactionPage {
  transaction_details?: Transaction[];
  total_pages?: number;
  page?: number;
}

export interface Webhook {
  id: string;
  url: string;
  event_types?: { name: string }[];
}
