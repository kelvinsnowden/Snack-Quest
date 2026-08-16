import 'server-only';

import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { withWebhookSecret } from '@/lib/webhooks/webhookSecret';
import { assertIntegrationEnabled } from '../shared/assertEnabled';
import type { DarajaIntegrationSecret } from '@/types';

/**
 * Daraja credentials, resolved per business
 * (`businesses/{businessId}/integrationSecrets/daraja`) — never a bare
 * env var. `process.env` is only ever touched by seed scripts, which
 * write a tenant's credentials in here once, the same way any other
 * tenant would configure their own.
 */
export interface DarajaConfig {
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  /** See `DarajaIntegrationSecret.accountType`'s own doc comment. */
  accountType: 'paybill' | 'till';
  passkey: string;
  callbackUrl: string;
  baseUrl: string;
}

/**
 * B2C credentials, resolved the same per-tenant way as `DarajaConfig`
 * — a distinct type because a tenant can have C2B configured without
 * B2C (or vice versa), and callers that only initiate STK pushes
 * should never need to know or care whether B2C is set up.
 */
export interface DarajaB2CConfig {
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  initiatorName: string;
  securityCredential: string;
  baseUrl: string;
  /** Derived from the C2B callbackUrl's origin — same host Safaricom already has permission to reach for this tenant, just different, dedicated B2C paths. */
  resultUrl: string;
  queueTimeoutUrl: string;
}

export class DarajaB2CNotConfiguredError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has no Daraja B2C credentials configured — cannot initiate a payout.`);
    this.name = 'DarajaB2CNotConfiguredError';
  }
}

/**
 * Real M-Pesa transaction reversals (§ RefundService + Daraja reversal
 * support) — a distinct type from `DarajaB2CConfig` for the same reason
 * that one is distinct from `DarajaConfig`: a tenant could theoretically
 * have B2C payouts configured without wanting refunds enabled, or vice
 * versa, even though today both derive from the exact same
 * `b2cInitiatorName`/`b2cSecurityCredential` fields — Safaricom's
 * reversal API is authorized by the same organization-level operator
 * credential as B2C, not a separate one.
 */
export interface DarajaReversalConfig {
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  initiatorName: string;
  securityCredential: string;
  baseUrl: string;
  resultUrl: string;
  queueTimeoutUrl: string;
}

export class DarajaReversalNotConfiguredError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has no Daraja operator credentials configured — cannot initiate a refund reversal.`);
    this.name = 'DarajaReversalNotConfiguredError';
  }
}

/**
 * Transaction Status Query credentials (§ Daraja B2C production
 * readiness — stuck-withdrawal reconciliation) — reuses the same B2C
 * operator credentials as `DarajaB2CConfig`/`DarajaReversalConfig`
 * (Safaricom authorizes this query under the same ORG API Initiator
 * role as B2C itself), with its own dedicated ResultURL/QueueTimeOutURL
 * path so a status-query result is never confused with a real B2C
 * payout result at the routing level.
 */
export interface DarajaTransactionStatusConfig {
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  initiatorName: string;
  securityCredential: string;
  baseUrl: string;
  resultUrl: string;
  queueTimeoutUrl: string;
}

export class DarajaTransactionStatusNotConfiguredError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has no Daraja operator credentials configured — cannot query transaction status.`);
    this.name = 'DarajaTransactionStatusNotConfiguredError';
  }
}

function toBaseUrl(secret: DarajaIntegrationSecret): string {
  return secret.env === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

export async function getDarajaConfig(businessId: string): Promise<DarajaConfig> {
  const secret = await businessIntegrationSecretRepository.get(businessId, 'daraja');
  assertIntegrationEnabled(businessId, 'daraja', secret);
  const webhookSecret = await businessIntegrationSecretRepository.ensureWebhookSecret(businessId, 'daraja', secret.webhookSecret);
  return {
    consumerKey: secret.consumerKey,
    consumerSecret: secret.consumerSecret,
    shortcode: secret.shortcode,
    // A secret document saved before `accountType` existed has no such
    // field at runtime even though the type now requires one —
    // defaults to 'paybill', this codebase's actual behavior before
    // the field was introduced, never silently assumed 'till'.
    accountType: secret.accountType === 'till' ? 'till' : 'paybill',
    passkey: secret.passkey,
    callbackUrl: withWebhookSecret(secret.callbackUrl, webhookSecret),
    baseUrl: toBaseUrl(secret),
  };
}

export async function getDarajaB2CConfig(businessId: string): Promise<DarajaB2CConfig> {
  const secret = await businessIntegrationSecretRepository.get(businessId, 'daraja');
  assertIntegrationEnabled(businessId, 'daraja', secret);
  if (!secret.b2cInitiatorName || !secret.b2cSecurityCredential) {
    throw new DarajaB2CNotConfiguredError(businessId);
  }
  const webhookSecret = await businessIntegrationSecretRepository.ensureWebhookSecret(businessId, 'daraja', secret.webhookSecret);

  const origin = new URL(secret.callbackUrl).origin;
  return {
    consumerKey: secret.consumerKey,
    consumerSecret: secret.consumerSecret,
    shortcode: secret.shortcode,
    initiatorName: secret.b2cInitiatorName,
    securityCredential: secret.b2cSecurityCredential,
    baseUrl: toBaseUrl(secret),
    resultUrl: withWebhookSecret(`${origin}/api/webhooks/daraja/${businessId}/b2c-result`, webhookSecret),
    queueTimeoutUrl: withWebhookSecret(`${origin}/api/webhooks/daraja/${businessId}/b2c-timeout`, webhookSecret),
  };
}

export async function getDarajaReversalConfig(businessId: string): Promise<DarajaReversalConfig> {
  const secret = await businessIntegrationSecretRepository.get(businessId, 'daraja');
  assertIntegrationEnabled(businessId, 'daraja', secret);
  if (!secret.b2cInitiatorName || !secret.b2cSecurityCredential) {
    throw new DarajaReversalNotConfiguredError(businessId);
  }
  const webhookSecret = await businessIntegrationSecretRepository.ensureWebhookSecret(businessId, 'daraja', secret.webhookSecret);

  const origin = new URL(secret.callbackUrl).origin;
  return {
    consumerKey: secret.consumerKey,
    consumerSecret: secret.consumerSecret,
    shortcode: secret.shortcode,
    initiatorName: secret.b2cInitiatorName,
    securityCredential: secret.b2cSecurityCredential,
    baseUrl: toBaseUrl(secret),
    resultUrl: withWebhookSecret(`${origin}/api/webhooks/daraja/${businessId}/reversal-result`, webhookSecret),
    queueTimeoutUrl: withWebhookSecret(`${origin}/api/webhooks/daraja/${businessId}/reversal-timeout`, webhookSecret),
  };
}

export async function getDarajaTransactionStatusConfig(businessId: string): Promise<DarajaTransactionStatusConfig> {
  const secret = await businessIntegrationSecretRepository.get(businessId, 'daraja');
  assertIntegrationEnabled(businessId, 'daraja', secret);
  if (!secret.b2cInitiatorName || !secret.b2cSecurityCredential) {
    throw new DarajaTransactionStatusNotConfiguredError(businessId);
  }
  const webhookSecret = await businessIntegrationSecretRepository.ensureWebhookSecret(businessId, 'daraja', secret.webhookSecret);

  const origin = new URL(secret.callbackUrl).origin;
  return {
    consumerKey: secret.consumerKey,
    consumerSecret: secret.consumerSecret,
    shortcode: secret.shortcode,
    initiatorName: secret.b2cInitiatorName,
    securityCredential: secret.b2cSecurityCredential,
    baseUrl: toBaseUrl(secret),
    resultUrl: withWebhookSecret(`${origin}/api/webhooks/daraja/${businessId}/transaction-status-result`, webhookSecret),
    queueTimeoutUrl: withWebhookSecret(`${origin}/api/webhooks/daraja/${businessId}/transaction-status-timeout`, webhookSecret),
  };
}
