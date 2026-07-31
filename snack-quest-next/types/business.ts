import type { AuditFields } from './common';

/**
 * `businesses/{businessId}` — a tenant of the platform. Snack Quest is
 * the first, reference tenant, not the architecture itself: every
 * value that used to be a bare env var (WhatsApp number, Daraja
 * shortcode, Meta Pixel, admin phone, currency) now lives here per
 * business, so a second business is a new document, never a code
 * change.
 */
export type BusinessStatus = 'active' | 'suspended';

export interface Business extends AuditFields {
  name: string;
  currency: string;
  /**
   * The WhatsApp Cloud API `phone_number_id` this business receives
   * inbound messages on — the only signal a shared webhook endpoint
   * has to know which tenant an inbound message belongs to, since
   * Whatchimp delivers every tenant's traffic to the same URL.
   */
  whatsappPhoneNumberId: string;
  countyCoverage: string[];
  /** WhatsApp number (E.164) that gets a message for every new order. Optional — a tenant may not want admin alerts yet. */
  adminWhatsappPhone: string | null;
  status: BusinessStatus;
}

/**
 * `businesses/{businessId}/integrationSecrets/{provider}` — per-tenant
 * provider credentials. Deliberately its own subcollection, not
 * fields on `businesses` itself, so the business profile document can
 * stay readable by more than just the Admin SDK later without ever
 * risking a credential leak — the security rule on this subcollection
 * is unconditional deny, independent of whatever the parent
 * document's rule becomes.
 */
export type IntegrationProvider = 'daraja' | 'whatchimp' | 'jumia' | 'meta';

export interface DarajaIntegrationSecret {
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackUrl: string;
  env: 'sandbox' | 'production';
}

export interface WhatchimpIntegrationSecret {
  apiKey: string;
  phoneNumberId: string;
  baseUrl?: string;
}

export interface JumiaIntegrationSecret {
  apiKey: string;
  merchantId: string;
  baseUrl?: string;
}

export interface MetaIntegrationSecret {
  pixelId: string;
  accessToken: string;
  apiVersion?: string;
}

export interface IntegrationSecretMap {
  daraja: DarajaIntegrationSecret;
  whatchimp: WhatchimpIntegrationSecret;
  jumia: JumiaIntegrationSecret;
  meta: MetaIntegrationSecret;
}

/**
 * NOT tenant data, deliberately absent from `WhatchimpIntegrationSecret`
 * above: every tenant's inbound traffic hits the *same* webhook URL,
 * and WhatsApp's verification handshake token is registered once, at
 * the Meta App level, for that one shared URL — it isn't a per-business
 * credential the way an API key or phone number is. Stays a platform
 * env var (`WHATCHIMP_WEBHOOK_VERIFY_TOKEN`), read before any
 * business is even known.
 */
