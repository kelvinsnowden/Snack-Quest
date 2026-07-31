import 'server-only';

import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';

export interface WhatchimpConfig {
  apiKey: string;
  phoneNumberId: string;
  baseUrl: string;
  catalogId?: string;
}

export async function getWhatchimpConfig(businessId: string): Promise<WhatchimpConfig> {
  const secret = await businessIntegrationSecretRepository.get(businessId, 'whatchimp');
  return {
    apiKey: secret.apiKey,
    phoneNumberId: secret.phoneNumberId,
    baseUrl: secret.baseUrl ?? 'https://api.whatchimp.com/v1',
    catalogId: secret.catalogId,
  };
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
