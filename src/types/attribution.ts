/**
 * Snack Quest Operating System - Marketing & Attribution Engine Types
 */

export type AdPlatformId = 'meta_pixel' | 'meta_capi' | 'ga4' | 'tiktok';

export type MarketingEventType =
  | 'PageView'
  | 'FirstVisit'
  | 'ReturningVisit'
  | 'SessionStart'
  | 'SessionEnd'
  | 'TimeOnPage'
  | 'ScrollDepth'
  | 'CTAClick'
  | 'WhatsAppClick'
  | 'HeroCTAClick'
  | 'FAQExpansion'
  | 'FounderStoryViewed'
  | 'ExitIntent'
  | 'FormAbandonment'
  | 'VideoPlay'
  | 'VideoCompletion'
  | 'GalleryInteraction'
  | 'ViewContent'
  | 'Lead'
  | 'Contact'
  | 'Purchase'
  | 'CompleteRegistration'
  | 'InitiateCheckout'
  | 'Refund';

export interface AttributionParams {
  fbclid?: string | null;
  gclid?: string | null;
  ttclid?: string | null;
  msclkid?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  landing_page?: string | null;
  first_touch_timestamp?: string | null;
  last_touch_timestamp?: string | null;
  fbp?: string | null;
  fbc?: string | null;
}

export interface AdvancedMatchingData {
  email_hash?: string | null;
  phone_hash?: string | null;
  external_id?: string | null;
  country?: string | null;
  city?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  client_ip?: string | null;
  user_agent?: string | null;
}

export interface AdPlatformConfig {
  platform: AdPlatformId;
  name: string;
  is_enabled: boolean;
  environment: 'sandbox' | 'production';
  pixel_id?: string;
  access_token?: string;
  measurement_id?: string;
  api_secret?: string;
  test_event_code?: string;
  debug_mode?: boolean;
  status: 'healthy' | 'warning' | 'error' | 'disabled';
  last_successful_event_at?: string | null;
  total_events_sent: number;
  failed_events_24h: number;
  match_quality_score: number; // 0 - 100%
  updated_at: string;
}

export interface MarketingEventRecord {
  id: string;
  event_id: string; // Deduplication ID shared across browser & server
  event_name: MarketingEventType;
  session_id: string;
  customer_id?: string | null;
  order_id?: string | null;
  timestamp: string;
  page_url: string;
  referrer: string;
  device_type: string;
  browser: string;
  os: string;
  screen_size: string;
  language: string;
  ip_address: string;
  user_agent: string;
  value_kes?: number;
  attribution_params: AttributionParams;
  advanced_matching: AdvancedMatchingData;
  dispatch_status: {
    meta_pixel: 'sent' | 'failed' | 'deduplicated' | 'disabled';
    meta_capi: 'sent' | 'failed' | 'deduplicated' | 'disabled';
    ga4: 'sent' | 'failed' | 'disabled';
    tiktok: 'sent' | 'failed' | 'disabled';
  };
  platform_responses?: Record<string, any>;
  error_message?: string | null;
  processing_status: 'processed' | 'failed' | 'queued';
  created_at: string;
}

export interface FunnelStageMetric {
  stage_id: string;
  stage_name: string;
  count: number;
  conversion_rate_pct: number;
  drop_off_pct: number;
  avg_time_seconds: number;
  description: string;
}

export interface AudienceSegment {
  id: string;
  name: string;
  description: string;
  customer_count: number;
  avg_clv_kes: number;
  sync_status: 'ready' | 'pending' | 'syncing';
  criteria: string;
}

export interface AuditReportCapability {
  name: string;
  category: string;
  status: 'operational' | 'awaiting_credentials' | 'configuration_only' | 'missing';
  notes: string;
}

export interface ProductionAuditReport {
  timestamp: string;
  production_readiness_score: number; // 0 - 100
  supported_platforms: string[];
  capabilities: AuditReportCapability[];
  deduplication_architecture: string;
  attribution_model: string;
  privacy_controls: string;
  remaining_external_dependencies: string[];
}
