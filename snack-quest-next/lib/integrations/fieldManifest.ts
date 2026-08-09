import type { IntegrationProvider } from '@/types';

/**
 * Declares the editable fields for each per-tenant integration secret
 * (§ Integration Portal) — the single source of truth both the admin
 * API routes and `businessIntegrationSecretRepository`'s transparent
 * encryption use. `secret: true` means: never returned in plaintext by
 * a GET, always encrypted at rest (`lib/secrets/secretCipher.ts`), and
 * masked to its last 4 characters in the UI. `secret: false` fields
 * (shortcode, callback URL, phone number id, merchant id, pixel id,
 * environment) are real operational config, not credentials — shown
 * and edited in the clear, same as everything on `/admin/settings`
 * already is.
 */
export interface IntegrationFieldSpec {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  helpText?: string;
  type?: 'text' | 'select';
  options?: readonly string[];
}

export const INTEGRATION_FIELD_MANIFEST: Record<IntegrationProvider, IntegrationFieldSpec[]> = {
  daraja: [
    { key: 'consumerKey', label: 'Consumer key', secret: true, required: true },
    { key: 'consumerSecret', label: 'Consumer secret', secret: true, required: true },
    { key: 'shortcode', label: 'Shortcode', secret: false, required: true },
    { key: 'passkey', label: 'Passkey', secret: true, required: true },
    { key: 'callbackUrl', label: 'Callback URL', secret: false, required: true },
    { key: 'env', label: 'Environment', secret: false, required: true, type: 'select', options: ['sandbox', 'production'] },
    { key: 'b2cInitiatorName', label: 'B2C initiator name', secret: false, required: false, helpText: 'Only needed to approve withdrawals via M-Pesa B2C.' },
    { key: 'b2cSecurityCredential', label: 'B2C security credential', secret: true, required: false, helpText: 'The initiator password already encrypted with Safaricom’s public certificate.' },
    { key: 'webhookSecret', label: 'Webhook secret', secret: true, required: false, helpText: 'Verifies inbound Daraja callbacks are really from Safaricom.' },
  ],
  whatchimp: [
    { key: 'apiKey', label: 'API key', secret: true, required: true },
    { key: 'phoneNumberId', label: 'Phone number ID', secret: false, required: true },
    { key: 'baseUrl', label: 'Base URL', secret: false, required: false, helpText: 'Defaults to the standard Whatchimp API host if left blank.' },
    { key: 'catalogId', label: 'Product catalog ID', secret: false, required: false, helpText: 'Only needed for WhatsApp Commerce Catalog sync.' },
    { key: 'teamMemberId', label: 'Escalation team member ID', secret: false, required: false, helpText: 'WhatChimp team member that door-delivery escalations assign the chat to. Leave blank to only record the escalation as a subscriber note.' },
  ],
  jumia: [
    { key: 'apiKey', label: 'API key', secret: true, required: true },
    { key: 'merchantId', label: 'Merchant ID', secret: false, required: true },
    { key: 'baseUrl', label: 'Base URL', secret: false, required: false, helpText: 'Defaults to the standard Jumia Logistics API host if left blank.' },
    { key: 'webhookSecret', label: 'Webhook secret', secret: true, required: false, helpText: 'Verifies inbound Jumia tracking updates are really from Jumia.' },
  ],
  meta: [
    { key: 'pixelId', label: 'Pixel ID', secret: false, required: true },
    { key: 'accessToken', label: 'Access token', secret: true, required: true },
    { key: 'apiVersion', label: 'API version', secret: false, required: false, helpText: 'Defaults to the current Graph API version if left blank, e.g. v21.0.' },
    { key: 'testEventCode', label: 'Test event code', secret: false, required: false, helpText: 'From Meta Events Manager → Test Events. Not required for real orders to work — only needed to use the Test Connection button below.' },
  ],
  // One SMTP account for everything a customer or creator receives
  // (§ one email provider for everything). Saving pushes it into the
  // Firebase project, which is what sends password resets
  // (identityPlatformGateway.ts), and the same credentials are what
  // this app's own mail goes out through (smtpEmailGateway.ts) — so a
  // business connects Mailgun once, against a domain it has verified,
  // and every message comes from that domain.
  authEmail: [
    { key: 'senderEmail', label: 'Send from', secret: false, required: true, helpText: 'The address every email arrives from, e.g. noreply@snackquests.shop. It must be on a domain you have verified with your provider (SPF and DKIM records added), or the mail will be treated as spoofed.' },
    { key: 'senderName', label: 'Sender name', secret: false, required: false, helpText: 'What recipients see instead of the raw address, e.g. Snack Quest.' },
    { key: 'host', label: 'SMTP host', secret: false, required: true, helpText: 'From your provider’s SMTP credentials page, e.g. smtp.mailgun.org.' },
    { key: 'port', label: 'SMTP port', secret: false, required: true, helpText: '587 for STARTTLS, 465 for SSL. Use whichever your provider recommends.' },
    { key: 'securityMode', label: 'Security', secret: false, required: true, type: 'select', options: ['START_TLS', 'SSL'] },
    { key: 'username', label: 'SMTP username', secret: false, required: true },
    { key: 'password', label: 'SMTP password', secret: true, required: true, helpText: 'Stored encrypted here and handed to Firebase. Neither this page nor Google will show it back to you.' },
  ],
};

export function getIntegrationFieldManifest(provider: IntegrationProvider): IntegrationFieldSpec[] {
  return INTEGRATION_FIELD_MANIFEST[provider];
}

export function getRequiredFieldKeys(provider: IntegrationProvider): string[] {
  return INTEGRATION_FIELD_MANIFEST[provider].filter((field) => field.required).map((field) => field.key);
}

export function getSecretFieldKeys(provider: IntegrationProvider): string[] {
  return INTEGRATION_FIELD_MANIFEST[provider].filter((field) => field.secret).map((field) => field.key);
}
