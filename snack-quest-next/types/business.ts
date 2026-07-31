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
  /**
   * B2C payouts (§ Admin: Withdrawals — Daraja B2C) — a distinct
   * credential pair from the C2B fields above, only needed by a
   * business that actually pays creators/customers out via M-Pesa.
   * Optional: a tenant with no B2C setup yet gets a documented,
   * fail-closed error the moment an admin tries to approve a
   * withdrawal, never a silent no-op with real money involved.
   *
   * `securityCredential` is the initiator password already encrypted
   * with Safaricom's public certificate (base64) — a one-time setup
   * step done wherever this secret is entered, never re-encrypted at
   * request time by this codebase (this codebase never handles the
   * raw initiator password).
   */
  b2cInitiatorName?: string;
  b2cSecurityCredential?: string;
  /**
   * Real origin verification for this business's Daraja webhooks
   * (§ Secure the Daraja and Whatchimp webhook routes) — Safaricom
   * signs nothing, so a secret this codebase generates itself and
   * embeds in the CallBackURL/ResultURL/QueueTimeOutURL it submits on
   * every API call (see `lib/integrations/daraja/config.ts`) is the
   * one verifiable mechanism available. Optional and fail-open when
   * absent (see `lib/webhooks/webhookSecret.ts`) so provisioning this
   * for existing businesses is a safe, non-breaking migration, not a
   * flag day.
   */
  webhookSecret?: string;
}

export interface WhatchimpIntegrationSecret {
  apiKey: string;
  phoneNumberId: string;
  baseUrl?: string;
  /**
   * The WhatsApp Commerce Catalog this business's product feed syncs
   * to (§ product catalog sync). Optional — a tenant that hasn't set
   * up a Product Catalog yet can still use every other WhatsApp
   * feature; catalog sync just becomes a documented no-op until it's
   * configured, same "fail closed with a clear reason, never silently"
   * discipline as every other not-yet-configured integration here.
   */
  catalogId?: string;
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
