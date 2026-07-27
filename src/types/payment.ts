/**
 * Snack Quest Operating System - Stage 8 Enterprise Payment Types
 */

export interface DarajaConfig {
  environment: 'sandbox' | 'production';
  consumer_key: string;
  consumer_secret: string;
  passkey: string;
  business_shortcode: string;
  till_number: string;
  paybill_number: string;
  initiator_name: string;
  security_credential?: string;
  stk_callback_url: string;
  b2c_result_url: string;
  b2c_timeout_url: string;
  reversal_result_url: string;
  reversal_timeout_url: string;
  oauth_status: 'valid' | 'expired' | 'error';
  oauth_expires_at?: string;
  cert_status: 'valid' | 'expiring_soon' | 'not_installed';
  last_tested_at?: string;
}

export interface B2CPayoutRequest {
  id: string;
  payout_type: 'creator_withdrawal' | 'staff_reimbursement' | 'customer_refund' | 'manual_transfer';
  recipient_phone: string;
  recipient_name: string;
  amount_kes: number;
  amount_cents: number;
  reason: string;
  requested_by: string;
  status: 'requested' | 'approved' | 'processing' | 'completed' | 'failed' | 'rejected';
  conversation_id?: string;
  originator_conversation_id?: string;
  result_code?: string;
  result_description?: string;
  mpesa_receipt_number?: string;
  settlement_time?: string;
  created_at: string;
  updated_at: string;
}

export interface ReversalRequest {
  id: string;
  original_payment_id: string;
  original_receipt: string;
  reversal_receipt?: string;
  amount_cents: number;
  reason: string;
  requested_by: string;
  approved_by?: string;
  status: 'pending_approval' | 'processing' | 'completed' | 'failed' | 'rejected';
  conversation_id?: string;
  result_code?: string;
  result_description?: string;
  created_at: string;
  updated_at: string;
}

export interface ReconciliationReport {
  reconciliation_date: string;
  total_internal_orders: number;
  total_daraja_transactions: number;
  matched_count: number;
  matched_volume_kes: number;
  discrepancies: Array<{
    id: string;
    type: 'duplicate_payment' | 'missing_callback' | 'amount_mismatch' | 'unknown_receipt' | 'partial_payment' | 'overpayment';
    order_id?: string;
    mpesa_receipt_number?: string;
    expected_cents: number;
    actual_cents: number;
    phone_number?: string;
    status: 'unresolved' | 'resolved' | 'ignored';
    notes?: string;
  }>;
}

export interface SettlementSummary {
  collections_today_kes: number;
  payouts_today_kes: number;
  gateway_fees_today_kes: number;
  net_cash_position_kes: number;
  pending_settlements_kes: number;
  outstanding_refunds_kes: number;
  creator_liabilities_kes: number;
  quest_wallet_liabilities_kes: number;
  last_updated: string;
}

export interface FraudAlert {
  id: string;
  order_id?: string;
  phone_number: string;
  fraud_score: number; // 0 to 100
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  triggers: string[];
  status: 'flagged' | 'cleared' | 'blocked';
  override_by?: string;
  created_at: string;
}

export interface PaymentGatewayHealth {
  daraja_status: 'operational' | 'degraded' | 'outage';
  oauth_status: 'valid' | 'expired' | 'error';
  avg_response_time_ms: number;
  callback_success_pct: number;
  pending_stk_sessions: number;
  timeout_rate_pct: number;
  cancellation_rate_pct: number;
  gateway_errors_24h: number;
  webhook_queue_size: number;
  retry_queue_size: number;
  collections_24h_kes: number;
  payouts_24h_kes: number;
}
