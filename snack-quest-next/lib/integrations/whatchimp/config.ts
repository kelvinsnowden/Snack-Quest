import 'server-only';

import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { assertIntegrationEnabled } from '../shared/assertEnabled';

export interface WhatchimpConfig {
  apiKey: string;
  phoneNumberId: string;
  baseUrl: string;
  catalogId?: string;
  teamMemberId?: string;
}

/**
 * WhatChimp's real API host, from its published developer console
 * (`https://app.whatchimp.com/api/v1/whatsapp/...`). The previous
 * default (`api.whatchimp.com/v1`) was a guess made before any real
 * documentation existed, alongside a Gateway modeled on Meta's Cloud
 * API — both are now corrected against the real thing.
 */
const DEFAULT_BASE_URL = 'https://app.whatchimp.com/api/v1';

export async function getWhatchimpConfig(businessId: string): Promise<WhatchimpConfig> {
  const secret = await businessIntegrationSecretRepository.get(businessId, 'whatchimp');
  assertIntegrationEnabled(businessId, 'whatchimp', secret);
  return {
    apiKey: secret.apiKey,
    phoneNumberId: secret.phoneNumberId,
    baseUrl: secret.baseUrl ?? DEFAULT_BASE_URL,
    catalogId: secret.catalogId,
    teamMemberId: secret.teamMemberId,
  };
}

/**
 * A capability this codebase's `WhatsAppGateway` interface declares
 * that WhatChimp's real API genuinely does not expose — thrown instead
 * of calling a fabricated endpoint that would 404 (or worse, silently
 * appear to work). Each thrower documents exactly what WhatChimp does
 * offer instead, so the gap is visible rather than mysterious.
 *
 * These are capability gaps, not incidents: callers that already treat
 * the call as best-effort (e.g. `ProductService.syncToCatalog`) should
 * swallow this the same way they swallow `CatalogNotConfiguredError`.
 */
export class WhatchimpCapabilityNotSupportedError extends Error {
  constructor(capability: string, detail: string) {
    super(`WhatChimp does not support "${capability}": ${detail}`);
    this.name = 'WhatchimpCapabilityNotSupportedError';
  }
}

/** Thrown by catalog sync when a tenant hasn't configured a Product Catalog yet — a documented, honest no-op, never a silent failure. */
export class CatalogNotConfiguredError extends Error {
  constructor(businessId: string) {
    super(
      `No WhatsApp Product Catalog configured for business ${businessId} — set catalogId on its whatchimp integration secret.`,
    );
    this.name = 'CatalogNotConfiguredError';
  }
}

/**
 * The webhook-verification token IS a bare env var, deliberately —
 * see `types/business.ts`'s note on `IntegrationSecretMap`: it's a
 * platform-level secret for the one shared webhook URL every tenant's
 * traffic arrives on, not a per-business credential.
 */
export class WebhookVerifyTokenNotConfiguredError extends Error {
  constructor() {
    super('WHATCHIMP_WEBHOOK_VERIFY_TOKEN is not set.');
    this.name = 'WebhookVerifyTokenNotConfiguredError';
  }
}

export function getWhatchimpWebhookVerifyToken(): string {
  const value = process.env.WHATCHIMP_WEBHOOK_VERIFY_TOKEN;
  if (!value) {
    throw new WebhookVerifyTokenNotConfiguredError();
  }
  return value;
}
