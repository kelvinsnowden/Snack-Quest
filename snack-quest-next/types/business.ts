import type { Timestamp } from 'firebase/firestore';
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
  /**
   * The customer-facing WhatsApp number (E.164, no leading "+") behind
   * `whatsappPhoneNumberId` above — distinct from it, since that's the
   * Cloud API's internal identifier, not something a `wa.me/` deep
   * link can use. Needed by creator referral click-through
   * (`app/r/[code]/route.ts`, § Creator Portal referral links) and the
   * marketing site's own "Order on WhatsApp" CTAs; optional because a
   * tenant can finish onboarding before configuring it, and both
   * consumers fail closed/gracefully rather than guess at a number.
   */
  whatsappCustomerNumber: string | null;
  status: BusinessStatus;
  /**
   * Customer loyalty / Quest system config (§ Phase 4) — absent or
   * `enabled: false` means no automatic wallet credit is ever awarded.
   * Deliberately opt-in with no guessed default bonus amounts: unlike
   * a delivery fee (where `null` safely means "not chargeable yet"),
   * a wallet bonus is the business paying real money out, so a
   * default here would mean auto-crediting customers with an amount
   * the owner never approved. An existing wallet balance stays fully
   * redeemable at checkout even while this is disabled — only new
   * earning stops.
   */
  loyaltyConfig?: LoyaltyConfig;
  /**
   * The homepage's photo-led sections (§ Homepage CMS) — `null` until
   * uploaded, in which case FounderStory/WhatsInside render an
   * on-brand illustrated panel instead of a fabricated photo. Uses the
   * same Vercel Blob upload path as product images
   * (`services/storageService.ts`, `directory: 'marketing'`), edited
   * from Admin > Settings > Homepage content — no code change needed
   * to swap either photo.
   */
  homepageContent?: HomepageContent;
}

export interface HomepageContent {
  founderImageUrl: string | null;
  whatsInsidePhotoUrl: string | null;
}

export interface LoyaltyConfig {
  enabled: boolean;
  /** Wallet credit for a customer's first-ever paid order. */
  firstOrderBonusKes: number;
  /** Award `repeatOrderBonusKes` every `repeatOrderIntervalCount`-th paid order (the 5th, 10th, 15th, ... for an interval of 5). */
  repeatOrderIntervalCount: number;
  repeatOrderBonusKes: number;
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
export type IntegrationProvider = 'daraja' | 'whatchimp' | 'jumia' | 'meta' | 'tiktok' | 'authEmail';

/**
 * Shared status/audit fields every per-tenant integration secret now
 * carries (§ Integration Portal). `enabled` lets an admin pause an
 * integration without deleting its credentials — every Gateway config
 * module (each provider's `config.ts`) checks it and fails closed
 * with a clear "integration disabled" error, the same discipline
 * already used for "not configured yet". The `lastTest*` fields record
 * the most recent "Test Connection" result so the portal can show a
 * real status without re-testing on every page load; they're written
 * only by `IntegrationSettingsService.testConnection()`, never by a
 * Gateway call made on the customer's behalf. All optional so every
 * integration seeded before this feature existed keeps working exactly
 * as before (`enabled` absent reads as `true`).
 */
export interface IntegrationSecretMeta {
  enabled?: boolean;
  lastTestedAt?: Timestamp | null;
  lastTestStatus?: 'success' | 'failure' | null;
  lastTestError?: string | null;
}

export interface DarajaIntegrationSecret extends IntegrationSecretMeta {
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

export interface WhatchimpIntegrationSecret extends IntegrationSecretMeta {
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
  /**
   * The WhatChimp team member a door-delivery escalation assigns the
   * customer's chat to (`/subscriber/chat/assign-to-team-member`,
   * which requires a real team member id). Optional — when unset, an
   * escalation still records the reason as a subscriber note, which is
   * the part an agent actually reads; only the inbox auto-assignment
   * is skipped.
   */
  teamMemberId?: string;
}

export interface JumiaIntegrationSecret extends IntegrationSecretMeta {
  apiKey: string;
  merchantId: string;
  baseUrl?: string;
  /**
   * Real origin verification for this business's Jumia tracking
   * webhook (§ Logistics: wire tracking webhook consumption) — same
   * URL-embedded-shared-secret mechanism and same fail-open-when-
   * absent discipline as `DarajaIntegrationSecret.webhookSecret` (see
   * that field's own comment, and `lib/webhooks/webhookSecret.ts`).
   * Jumia's real API has no documented signing scheme to verify
   * instead — same honest gap as Daraja/Whatchimp.
   */
  webhookSecret?: string;
}

export interface MetaIntegrationSecret extends IntegrationSecretMeta {
  pixelId: string;
  accessToken: string;
  apiVersion?: string;
  /** From Events Manager → Test Events — only needed for the Integration Portal's Test Connection button, never for real event dispatch. */
  testEventCode?: string;
}

/**
 * TikTok Events API (§ close the loop: ad-conversion attribution).
 * `pixelCode` should be the same code the site's client-side TikTok
 * Pixel loads with (`lib/config/tiktokPixel.ts`) — using one pixel for
 * both the browser event and this server event is what lets TikTok
 * de-duplicate and match them to the same visit.
 */
export interface TiktokIntegrationSecret extends IntegrationSecretMeta {
  pixelCode: string;
  accessToken: string;
  /** From TikTok Events Manager → the pixel's Test Events tab — only needed for the Integration Portal's Test Connection button, never for real event dispatch. */
  testEventCode?: string;
}

/**
 * The SMTP account Firebase Authentication sends password-reset mail
 * through. Stored here like any other credential, then pushed into the
 * project's Identity Platform config — Firebase, not this app, is what
 * actually connects to the server (see
 * `lib/integrations/authEmail/config.ts`).
 */
export interface AuthEmailIntegrationSecret extends IntegrationSecretMeta {
  senderEmail: string;
  senderName?: string;
  host: string;
  /** Stored as a string like every other field on these documents; parsed and range-checked when read. */
  port: string;
  securityMode: string;
  username: string;
  password: string;
}

export interface IntegrationSecretMap {
  daraja: DarajaIntegrationSecret;
  whatchimp: WhatchimpIntegrationSecret;
  jumia: JumiaIntegrationSecret;
  meta: MetaIntegrationSecret;
  tiktok: TiktokIntegrationSecret;
  authEmail: AuthEmailIntegrationSecret;
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
