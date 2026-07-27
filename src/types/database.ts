/**
 * Snack Quest Operating System - Full Database Types & Enums
 * 36 Enterprise Tables with strict typing and integer monetary values in KES minor units (cents).
 */

// ==========================================
// ENUMS
// ==========================================

export type CustomerStatus = 'new' | 'active' | 'vip' | 'dormant' | 'blacklisted';

export type OrderStatus = 'pending' | 'confirmed' | 'packed' | 'dispatched' | 'delivered' | 'cancelled' | 'refunded';

export type PaymentStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'refunded'
  | 'partially_refunded'
  | 'chargeback'
  | 'reversed'
  | 'initiated'
  | 'paid'
  | 'partially_paid';

export type PaymentMethod = 
  | 'mpesa'
  | 'daraja_stk'
  | 'manual_till'
  | 'wallet_credit'
  | 'mixed_wallet_mpesa'
  | 'admin_manual'
  | 'manual'
  | 'card'
  | 'shopify_checkout'
  | 'other';

export type OrderSource = 'whatsapp' | 'shopify' | 'meta_shop' | 'tiktok_shop';

export type SnackStatus = 'in_stock' | 'low_stock' | 'out_of_stock' | 'discontinued';

export type PurchaseOrderItemType = 'snack' | 'packaging';

export type PurchaseOrderStatus = 'ordered' | 'received' | 'partially_received' | 'cancelled';

export type DeliveryStatus = 'pending' | 'packed' | 'collected' | 'in_transit' | 'delivered' | 'returned' | 'cancelled';

export type RewardSubmissionStatus = 'pending' | 'approved' | 'rejected';

export type WalletTransactionType = 'reward_approved' | 'referral_bonus' | 'redeemed_on_order' | 'manual_adjustment' | 'reversal';

export type ReferralStatus = 'pending' | 'qualified' | 'rewarded' | 'fraud_flagged';

export type ExpenseCategory = 'advertising' | 'salaries' | 'rent' | 'software' | 'other';

export type StaffRoleName = 'Administrator' | 'Operations' | 'Packing' | 'Customer Support' | 'Finance' | 'Marketing' | 'Read-only';

export type NotificationRecipientType = 'customer' | 'staff';

export type NotificationChannel = 'whatsapp' | 'email' | 'sms';

export type NotificationStatus = 'queued' | 'sent' | 'delivered' | 'failed';

export type AuditAction = 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'login' | 'export' | 'stk_push_initiate' | 'manual_till_verify' | 'payment_refund';

export type WebhookProcessingStatus = 'received' | 'processed' | 'failed';

export type ReportFrequency = 'daily' | 'weekly' | 'monthly';

export type ReportFormat = 'csv' | 'xlsx' | 'pdf';

// ==========================================
// BASE RECORD INTERFACE
// ==========================================

export interface BaseRecord {
  id: string;
  created_at: string;
  updated_at: string;
}

// ==========================================
// 2.1 REFERENCE & CONFIGURATION TABLES
// ==========================================

export interface LandingPage extends BaseRecord {
  slug: string;
  name: string;
  theme_config: Record<string, any>;
  is_active: boolean;
}

export interface Package extends BaseRecord {
  sku: string;
  name: string;
  description: string;
  selling_price: number; // in cents
  estimated_snack_cost: number; // in cents
  currency: string;
  is_active: boolean;
  includes_drinks: boolean;
  eligible_referral_discount: boolean;
  eligible_quest_wallet: boolean;
  creator_commission_applies: boolean;
  available_nationwide: boolean;
  best_for?: string;
}

export interface Courier extends BaseRecord {
  name: string;
  default_fee: number; // in cents
  contact_phone: string;
  coverage_counties: string[];
  is_active: boolean;
}

export interface Supplier extends BaseRecord {
  name: string;
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  notes: string;
}

export interface RewardType extends BaseRecord {
  code: string;
  label: string;
  credit_value: number; // in cents
  requires_approval: boolean;
  is_active: boolean;
  image_url?: string;
  description?: string;
  difficulty?: string;
  est_minutes?: number;
  external_platform_url?: string;
  platform_button_label?: string;
  category?: string;
}

export interface RewardRule extends BaseRecord {
  reward_type_id: string;
  max_submissions_per_customer: number | null;
  cooldown_days: number;
}

export interface TaxRate extends BaseRecord {
  country_code: string;
  label: string;
  rate_percent: number;
  is_active: boolean;
}

export interface Currency extends BaseRecord {
  code: string;
  symbol: string;
  is_active: boolean;
}

export interface Warehouse extends BaseRecord {
  name: string;
  county: string;
  is_active: boolean;
}

// ==========================================
// 2.2 ATTRIBUTION & SESSIONS
// ==========================================

export interface SessionRecord extends BaseRecord {
  landing_page_id: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  utm_medium: string | null;
  utm_adset: string | null;
  utm_ad: string | null;
  utm_creative: string | null;
  referrer: string | null;
  fbclid: string | null;
  gclid: string | null;
  ttclid: string | null;
  first_visit_at: string;
  conversion_order_id: string | null;
  converted_customer_id: string | null;
}

// ==========================================
// 2.3 CUSTOMERS
// ==========================================

export interface Customer extends BaseRecord {
  full_name: string;
  name?: string;
  phone: string;
  email: string | null;
  county: string;
  town: string;
  delivery_address: string;
  registration_date: string;
  first_order_id: string | null;
  latest_order_id: string | null;
  lifetime_orders: number;
  lifetime_revenue: number; // cents
  lifetime_profit: number; // cents
  quest_wallet_balance: number; // cents
  lifetime_credits_earned: number; // cents
  lifetime_credits_used: number; // cents
  referral_code: string;
  referred_by_customer_id: string | null;
  total_referrals: number;
  acquisition_landing_page_id: string | null;
  acquisition_utm_source: string | null;
  acquisition_utm_campaign: string | null;
  acquisition_session_id: string | null;
  notes: string | null;
  status: CustomerStatus;
  whatchimp_conversation_id: string | null;
  preferred_language?: string;
  preferred_county?: string;
  preferred_pickup_station?: string;
  preferred_pickup_station_id?: string;
  preferred_delivery_method?: string;
  creator_id?: string;
  preferred_snacks?: string[];
  favourite_categories?: string[];
  favourite_countries_of_origin?: string[];
  frequently_purchased_products?: string[];
  wishlist?: string[];
  disliked_snacks?: string[];
  dietary_preferences?: string[];
  allergies?: string[];
  social_media_handles?: Record<string, string>;
  google_reviews_submitted?: number;
  ugc_submissions_count?: number;
  health_score?: number; // 0 to 100
  health_status?: 'healthy' | 'attention_needed' | 'at_risk';
  churn_probability?: number;
  csat_score?: number;
  nps_score?: number;
  privacy_anonymized?: boolean;
  marketing_preferences?: Record<string, boolean>;
  notification_preferences?: Record<string, boolean>;
}

export interface CustomerTag extends BaseRecord {
  customer_id: string;
  tag: string;
}

export type CustomerTimelineEventType =
  | 'landing_visit'
  | 'whatsapp_started'
  | 'order_placed'
  | 'payment_received'
  | 'shipment_created'
  | 'pickup_completed'
  | 'quest_completed'
  | 'reward_earned'
  | 'referral_made'
  | 'support_ticket_opened'
  | 'refund_issued'
  | 'manual_note_added'
  | 'vip_promoted'
  | 'marketing_received'
  | 'privacy_request'
  | 'customer_merged';

export interface CustomerTimelineEvent extends BaseRecord {
  customer_id: string;
  event_type: CustomerTimelineEventType;
  title: string;
  description: string;
  actor: string;
  metadata?: Record<string, any>;
}

export interface CustomerSegment extends BaseRecord {
  code: string;
  name: string;
  description: string;
  criteria_type: 'system_auto' | 'rule_based' | 'custom_tag';
  rule_json?: Record<string, any>;
  member_count?: number;
  is_system: boolean;
}

export type SupportCategory =
  | 'general_inquiry'
  | 'delivery_issue'
  | 'payment_issue'
  | 'refund_request'
  | 'damaged_product'
  | 'wrong_product'
  | 'complaint'
  | 'suggestion'
  | 'technical_issue';

export type SupportPriority = 'low' | 'medium' | 'high' | 'urgent';

export type SupportStatus = 'open' | 'pending' | 'escalated' | 'resolved' | 'closed';

export interface SupportTicket extends BaseRecord {
  ticket_number: string;
  customer_id: string;
  order_id?: string | null;
  category: SupportCategory;
  priority: SupportPriority;
  status: SupportStatus;
  subject: string;
  description: string;
  assigned_staff_id?: string | null;
  sla_target_minutes: number;
  sla_expires_at: string;
  sla_breached: boolean;
  satisfaction_rating?: number | null; // 1-5
  resolution_code?: string | null;
  attachments?: string[];
  resolved_at?: string | null;
}

export interface SupportTicketNote extends BaseRecord {
  ticket_id: string;
  author_id: string;
  author_name: string;
  author_type: 'staff' | 'customer';
  is_internal: boolean;
  content: string;
  attachments?: string[];
}

export interface CustomerInternalNote extends BaseRecord {
  customer_id: string;
  author_id: string;
  author_name: string;
  content: string;
  note_category: 'preference' | 'gift_packaging' | 'delivery_instruction' | 'influencer_vip' | 'behavior_warning' | 'general';
}

export interface CustomerCommunicationLog extends BaseRecord {
  customer_id: string;
  channel: 'whatsapp' | 'email' | 'sms' | 'phone_call' | 'manual_chat' | 'automated_system';
  direction: 'inbound' | 'outbound';
  sender: string;
  recipient: string;
  message_content: string;
  delivery_status: 'delivered' | 'read' | 'sent' | 'failed';
}

export interface CustomerSurveyRecord extends BaseRecord {
  customer_id: string;
  order_id?: string | null;
  survey_type: 'csat' | 'nps' | 'post_delivery' | 'resolution_feedback';
  score: number; // CSAT (1-5), NPS (1-10)
  feedback_comment?: string | null;
}

export interface CustomerPrivacyConsent extends BaseRecord {
  customer_id: string;
  marketing_whatsapp: boolean;
  marketing_email: boolean;
  marketing_sms: boolean;
  data_analytics: boolean;
  consent_updated_at: string;
}

export interface CustomerPrivacyRequest extends BaseRecord {
  customer_id: string;
  request_type: 'data_export' | 'right_to_delete' | 'pii_masking';
  status: 'pending' | 'completed' | 'rejected';
  requested_by: string;
  notes?: string | null;
  completed_at?: string | null;
}

// ==========================================
// 2.4 ORDERS & PAYMENTS
// ==========================================

export interface Order extends BaseRecord {
  customer_id: string;
  order_date: string;
  package_id: string;
  selling_price: number; // cents
  discount: number; // cents
  quest_credits_used: number; // cents
  tax_amount: number; // cents
  final_amount_paid: number; // cents
  packaging_cost: number; // cents
  snack_cost: number; // cents
  delivery_cost: number; // cents
  payment_fees: number; // cents
  advertising_cost: number; // cents
  gross_profit: number; // generated: selling_price - discount - snack_cost - packaging_cost
  net_profit: number; // generated: gross_profit - delivery_cost - payment_fees - advertising_cost
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment_status?: string;
  courier_id: string | null;
  tracking_number: string | null;
  landing_page_id: string | null;
  session_id: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  fbclid: string | null;
  gclid: string | null;
  ttclid: string | null;
  referral_code_used: string | null;
  order_source: OrderSource;
  delivery_method?: string;
  county?: string;
  stock_shortage: boolean;
  balance_due: number; // cents
  created_by: string | null;
  updated_by: string | null;
}

export interface Payment extends BaseRecord {
  order_id: string;
  customer_id?: string | null;
  amount: number; // cents
  method: PaymentMethod;
  mpesa_receipt_number: string | null;
  phone_number?: string | null;
  checkout_request_id?: string | null;
  merchant_request_id?: string | null;
  idempotency_key?: string | null;
  status: PaymentStatus;
  result_code?: number | null;
  result_desc?: string | null;
  failure_reason?: string | null;
  paid_at: string | null;
  reconciled?: boolean;
  reconciled_at?: string | null;
  reconciled_by?: string | null;
  raw_callback_payload?: any;
}

export interface UnmatchedPayment extends BaseRecord {
  mpesa_receipt_number: string;
  phone_number: string;
  amount_cents: number;
  paybill_till_number: string;
  checkout_request_id?: string | null;
  status: 'unmatched' | 'reconciled' | 'refunded';
  notes?: string | null;
  matched_order_id?: string | null;
}

export interface PaymentReconciliationRecord extends BaseRecord {
  payment_id: string;
  order_id: string;
  expected_amount_cents: number;
  actual_amount_cents: number;
  discrepancy_cents: number;
  reconciliation_type: 'automated' | 'manual_override' | 'refund_processed';
  reconciled_by: string;
  notes?: string | null;
}

export interface PaymentTimelineEvent extends BaseRecord {
  payment_id?: string | null;
  order_id: string;
  event_type:
    | 'checkout_started'
    | 'stk_initiated'
    | 'callback_received'
    | 'payment_confirmed'
    | 'payment_failed'
    | 'inventory_reserved'
    | 'inventory_released'
    | 'inventory_deducted'
    | 'wallet_updated'
    | 'notification_sent'
    | 'handed_to_fulfillment'
    | 'payment_recovered'
    | 'reconciliation_action';
  source: string;
  actor?: string | null;
  message: string;
  metadata?: Record<string, any>;
}

export interface InventoryReservation extends BaseRecord {
  order_id: string;
  snack_id?: string | null;
  packaging_item_id?: string | null;
  quantity_reserved: number;
  status: 'active' | 'converted' | 'released' | 'expired';
  expires_at: string;
  released_at?: string | null;
  converted_at?: string | null;
}

export interface OrderStatusHistory extends BaseRecord {
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: string | null;
  changed_at: string;
  note: string | null;
}

// ==========================================
// 2.5 INVENTORY & PACKAGING
// ==========================================

export interface Snack extends BaseRecord {
  name: string;
  sku: string;
  supplier_id: string;
  purchase_price: number; // cents
  selling_cost_allocation: number; // cents
  category: string;
  country_of_origin: string;
  quantity_purchased: number;
  quantity_remaining: number;
  minimum_stock: number;
  reorder_point: number;
  status: SnackStatus;
}

export interface SnackBatch extends BaseRecord {
  snack_id: string;
  warehouse_id: string | null;
  batch_reference: string;
  quantity: number;
  quantity_remaining: number;
  purchase_date: string;
  expiry_date: string | null;
  purchase_price: number; // cents
}

export interface OrderSnackItem extends BaseRecord {
  order_id: string;
  snack_batch_id: string;
  quantity: number;
  unit_cost: number; // cents
}

export interface PackagingItem extends BaseRecord {
  name: string;
  current_stock: number;
  unit_cost: number; // cents
  supplier_id: string;
  minimum_stock: number;
  reorder_level: number;
}

export interface PackagePackagingRequirement extends BaseRecord {
  package_id: string;
  packaging_item_id: string;
  quantity_required: number;
}

export interface PurchaseOrder extends BaseRecord {
  supplier_id: string;
  item_type: PurchaseOrderItemType;
  item_id: string;
  quantity: number;
  unit_cost: number; // cents
  total_cost: number; // cents
  purchase_date: string;
  status: PurchaseOrderStatus;
  created_by: string;
}

// ==========================================
// 2.6 DELIVERY
// ==========================================

export interface Delivery extends BaseRecord {
  order_id: string;
  courier_id: string | null;
  warehouse_id: string | null;
  fee: number; // cents
  county: string;
  town: string;
  delivery_address: string;
  delivery_status: DeliveryStatus;
  proof_of_delivery_url: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
}

export interface DeliveryStatusHistory extends BaseRecord {
  delivery_id: string;
  status: DeliveryStatus;
  changed_by: string | null;
  changed_at: string;
  note: string | null;
}

// ==========================================
// 2.7 REWARDS, WALLET & REFERRALS
// ==========================================

export interface RewardSubmission extends BaseRecord {
  customer_id: string;
  reward_type_id: string;
  proof_url: string;
  status: RewardSubmissionStatus;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
}

export interface WalletTransaction extends BaseRecord {
  customer_id: string;
  amount: number; // cents (signed)
  transaction_type: WalletTransactionType;
  source_reward_submission_id: string | null;
  source_referral_id: string | null;
  source_order_id: string | null;
  balance_after: number; // cents
  created_by: string | null;
  note: string | null;
}

export interface Referral extends BaseRecord {
  referrer_customer_id: string;
  referrer_creator_id?: string;
  referred_customer_id: string;
  referral_code_used: string;
  qualifying_order_id: string | null;
  status: ReferralStatus;
  rewarded_at: string | null;
  commission_earned?: number;
}

// ==========================================
// 2.8 ACCOUNTING
// ==========================================

export interface OperatingExpense extends BaseRecord {
  category: ExpenseCategory;
  description: string;
  amount: number; // cents
  expense_date: string;
  created_by: string;
}

// ==========================================
// 2.9 PLATFORM / STAFF / SECURITY
// ==========================================

export interface StaffUser extends BaseRecord {
  full_name: string;
  email: string;
  role_id: string;
  is_active: boolean;
  last_login_at: string | null;
}

export interface Role extends BaseRecord {
  name: StaffRoleName;
  description: string;
}

export interface RolePermission extends BaseRecord {
  role_id: string;
  module: string; // e.g. 'dashboard', 'settings', 'audit', 'integrations', 'crm', 'orders', 'inventory', 'deliveries', 'rewards', 'accounting'
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
}

export interface NotificationLog extends BaseRecord {
  recipient_type: NotificationRecipientType;
  recipient_id: string;
  channel: NotificationChannel;
  template_code: string;
  payload: Record<string, any>;
  status: NotificationStatus;
  related_order_id: string | null;
  sent_at: string | null;
}

export interface AuditLog extends BaseRecord {
  staff_user_id: string | null;
  staff_user_name?: string;
  action: AuditAction;
  table_name: string;
  record_id: string;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  ip_address: string;
}

export interface ApiRequestLog extends BaseRecord {
  endpoint: string;
  method: string;
  caller: string;
  status_code: number;
  request_payload: Record<string, any> | null;
  response_summary: string;
  duration_ms: number;
}

export interface WebhookEvent extends BaseRecord {
  source: string;
  event_type: string;
  payload: Record<string, any>;
  processing_status: WebhookProcessingStatus;
  error_message: string | null;
  idempotency_key: string | null;
}

export interface Organization extends BaseRecord {
  name: string;
  default_currency: string;
  default_country_code: string;
  timezone: string;
  logo_url: string;
}

export type IntegrationStatus = 'not_connected' | 'connected' | 'error';

export interface IntegrationConnection extends BaseRecord {
  name: string; // e.g. 'make_webhooks', 'daraja_mpesa', 'whatchimp', 'shopify', 'courier_apis', 'email_provider', 'sms_provider', 'meta_ads', 'tiktok_ads', 'google_ads'
  display_name: string;
  status: IntegrationStatus;
  last_synced_at: string | null;
  category: 'core' | 'channel' | 'messaging' | 'marketing' | 'fulfillment';
  description: string;
  config: Record<string, any>;
}

export interface SystemMetricsSnapshot extends BaseRecord {
  metric_name: string; // e.g. 'db_size_mb', 'p95_query_latency_ms', 'orders_row_count', 'sessions_row_count', 'error_rate_pct'
  value: number;
  captured_at: string;
}

export interface ApiToken extends BaseRecord {
  name: string;
  token_preview: string; // e.g. 'sq_live_...9f3a'
  created_by: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface FeatureFlag extends BaseRecord {
  key: string;
  label?: string;
  is_enabled: boolean;
  description: string;
  updated_by?: string;
}

export interface ScheduledReport extends BaseRecord {
  title?: string;
  report_type: string; // e.g. 'monthly_profit', 'campaign_attribution', 'low_stock', 'delivery_summary'
  frequency: ReportFrequency;
  recipients: string[];
  format: ReportFormat;
  is_active: boolean;
  created_by?: string;
  last_run_at?: string | null;
  next_run_at?: string | null;
}

export type IntegrationEnvironment = 'sandbox' | 'production';
export type IntegrationHealthStatus = 'connected' | 'warning' | 'disconnected';
export type IntegrationCategory = 'payments' | 'messaging' | 'marketing' | 'automation' | 'ai' | 'shipping' | 'ecommerce' | 'infrastructure';

export interface IntegrationConfig extends BaseRecord {
  integration_id: string; // e.g. 'daraja_mpesa', 'whatchimp', 'sendgrid', 'bulk_sms', 'meta_conversion', 'tiktok_pixel', 'google_analytics_4', 'make_webhooks', 'gemini_ai', 'courier_apis', 'shopify', 'firebase'
  display_name: string;
  category: IntegrationCategory;
  description: string;
  environment: IntegrationEnvironment;
  status: IntegrationHealthStatus;
  credentials: Record<string, string>;
  endpoints: {
    callback_url?: string;
    confirmation_url?: string;
    validation_url?: string;
    timeout_url?: string;
    webhook_url?: string;
    stk_push_endpoint?: string;
    [key: string]: string | undefined;
  };
  token_status: {
    status: 'valid' | 'invalid' | 'expired';
    expires_in_minutes: number;
    expires_at?: string;
  };
  webhook_status: {
    status: 'healthy' | 'warning' | 'degraded';
    signing_secret_preview?: string;
    retry_count_24h?: number;
    failed_events_24h?: number;
  };
  last_connected_at: string | null;
  last_synced_at: string | null;
  latency_ms: number;
}

export interface IntegrationLog extends BaseRecord {
  integration_id: string;
  integration_name: string;
  timestamp: string;
  event: string;
  status: 'success' | 'warning' | 'error' | 'info';
  message: string;
  latency_ms?: number;
  ip_address?: string;
  details?: Record<string, any>;
}

export interface IntegrationHealthSummary {
  connected_count: number;
  warning_count: number;
  disconnected_count: number;
  avg_api_latency_ms: number;
  webhook_success_rate: number;
  failed_requests_today: number;
}

export interface IntegrationSecretRecord extends BaseRecord {
  integration_id: string;
  key_name: string;
  masked_value: string;
  environment: IntegrationEnvironment;
  updated_by: string;
}

export interface IntegrationAuditRecord extends BaseRecord {
  staff_user_id: string;
  staff_user_name: string;
  timestamp: string;
  integration_id: string;
  integration_name: string;
  action: string;
  ip_address: string;
  old_masked_values: Record<string, string>;
  new_masked_values: Record<string, string>;
}

// ==========================================
// PHASE 5 — DELIVERY ARCHITECTURE & JUMIA LOGISTICS
// ==========================================

export interface PickupStation extends BaseRecord {
  station_code: string;
  name: string;
  county: string;
  area: string;
  address: string;
  latitude: number;
  longitude: number;
  opening_hours: string;
  delivery_zone_id: string;
  delivery_fee: number; // in KES cents
  estimated_delivery_days: number;
  is_active: boolean;
  version: number;
}

export interface PickupStationVersion {
  id: string;
  station_id: string;
  version: number;
  changed_fields: Record<string, { old_value: any; new_value: any }>;
  changed_by: string;
  reason: string;
  created_at: string;
}

export interface DeliveryZone extends BaseRecord {
  zone_code: string;
  zone_name: string;
  base_fee: number; // in KES cents
  estimated_days: number;
  is_active: boolean;
}

export interface DeliveryMethodRule extends BaseRecord {
  code: string; // e.g., 'jumia_pickup', 'door_delivery_nairobi'
  name: string;
  description: string;
  coverage_counties: string[]; // e.g. ['all'], ['Nairobi'], ['!Nairobi']
  automation_type: 'fully_automated' | 'human_assisted';
  assigned_courier_id: string;
  fee_strategy: 'pickup_station_rate' | 'negotiated_agent_fee' | 'flat_rate';
  flat_fee_cents: number;
  agent_assignment_required: boolean;
  is_active: boolean;
}

export type ShipmentStatus =
  | 'awaiting_fulfillment'
  | 'ready_to_dispatch'
  | 'dispatched'
  | 'ready_for_pickup'
  | 'collected'
  | 'cancelled'
  | 'failed_delivery'
  | 'returned';

export interface Shipment extends BaseRecord {
  order_id: string;
  courier_id: string;
  courier_name: string;
  tracking_number: string;
  pickup_station_id: string | null;
  pickup_station_name: string | null;
  delivery_method_code: string;
  county: string;
  area: string;
  delivery_fee: number; // cents
  status: ShipmentStatus;
  dispatched_at: string | null;
  ready_for_pickup_at: string | null;
  collected_at: string | null;
  assigned_agent_id: string | null;
}

export interface ShipmentTimelineEvent {
  id: string;
  shipment_id: string;
  order_id: string;
  event_type:
    | 'shipment_created'
    | 'awaiting_fulfillment'
    | 'packed'
    | 'handed_to_courier'
    | 'in_transit'
    | 'ready_for_pickup'
    | 'collected'
    | 'returned'
    | 'cancelled'
    | 'failed_delivery'
    | 'exception_raised';
  message: string;
  actor: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface DeliveryExceptionRecord extends BaseRecord {
  shipment_id: string;
  order_id: string;
  customer_id: string;
  exception_type:
    | 'uncollected_parcel'
    | 'station_closed'
    | 'parcel_damaged'
    | 'failed_delivery'
    | 'station_change_requested'
    | 'address_update_requested'
    | 'returned_shipment';
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  notes: string;
  resolution_action: string | null;
  assigned_agent_id: string | null;
  resolved_at: string | null;
}

export interface SalesAgent extends BaseRecord {
  name: string;
  email: string;
  phone: string;
  status: 'active' | 'busy' | 'offline';
  current_workload: number;
  max_workload: number;
  assigned_counties: string[];
  specializations: string[];
}

export interface AgentAssignmentRule extends BaseRecord {
  rule_name: string;
  strategy: 'round_robin' | 'lowest_workload' | 'region_match' | 'specialization';
  is_active: boolean;
}

// ==========================================
// COMBINED SYSTEM STATE INTERFACE
// ==========================================

export interface DatabaseState {
  organizations: Organization[];
  integration_connections: IntegrationConnection[];
  integration_configs?: IntegrationConfig[];
  integration_logs?: IntegrationLog[];
  integration_secrets?: IntegrationSecretRecord[];
  integration_audit_logs?: IntegrationAuditRecord[];
  system_metrics_snapshots: SystemMetricsSnapshot[];
  api_tokens: ApiToken[];
  landing_pages: LandingPage[];
  packages: Package[];
  couriers: Courier[];
  suppliers: Supplier[];
  reward_types: RewardType[];
  reward_rules: RewardRule[];
  tax_rates: TaxRate[];
  currencies: Currency[];
  warehouses: Warehouse[];
  sessions: SessionRecord[];
  customers: Customer[];
  customer_tags: CustomerTag[];
  orders: Order[];
  payments: Payment[];
  unmatched_payments?: UnmatchedPayment[];
  payment_reconciliations?: PaymentReconciliationRecord[];
  payment_timeline_events?: PaymentTimelineEvent[];
  inventory_reservations?: InventoryReservation[];
  order_status_history: OrderStatusHistory[];
  snacks: Snack[];
  snack_batches: SnackBatch[];
  order_snack_items: OrderSnackItem[];
  packaging_items: PackagingItem[];
  package_packaging_requirements: PackagePackagingRequirement[];
  purchase_orders: PurchaseOrder[];
  deliveries: Delivery[];
  delivery_status_history: DeliveryStatusHistory[];
  pickup_stations?: PickupStation[];
  pickup_station_versions?: PickupStationVersion[];
  delivery_zones?: DeliveryZone[];
  delivery_method_rules?: DeliveryMethodRule[];
  shipments?: Shipment[];
  shipment_timeline_events?: ShipmentTimelineEvent[];
  delivery_exceptions?: DeliveryExceptionRecord[];
  sales_agents?: SalesAgent[];
  agent_assignment_rules?: AgentAssignmentRule[];
  reward_submissions: RewardSubmission[];
  wallet_transactions: WalletTransaction[];
  referrals: Referral[];
  creators?: any[];
  mpesa_express_logs?: any[];
  operating_expenses: OperatingExpense[];
  staff_users: StaffUser[];
  roles: Role[];
  role_permissions: RolePermission[];
  notifications_log: NotificationLog[];
  audit_logs: AuditLog[];
  api_request_logs: ApiRequestLog[];
  webhook_events: WebhookEvent[];
  feature_flags: FeatureFlag[];
  scheduled_reports: ScheduledReport[];
  customer_timeline_events?: CustomerTimelineEvent[];
  customer_segments?: CustomerSegment[];
  support_tickets?: SupportTicket[];
  support_ticket_notes?: SupportTicketNote[];
  customer_internal_notes?: CustomerInternalNote[];
  customer_communication_logs?: CustomerCommunicationLog[];
  customer_surveys?: CustomerSurveyRecord[];
  customer_privacy_consents?: CustomerPrivacyConsent[];
  customer_privacy_requests?: CustomerPrivacyRequest[];
}
