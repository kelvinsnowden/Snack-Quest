import 'server-only';

import type { IntegrationProvider, IntegrationSecretMeta } from '@/types';

/**
 * Thrown when an admin has explicitly disabled an integration from the
 * Integration Portal (§ Integration Portal) — distinct from "not
 * configured yet" (`IntegrationSecretNotFoundError`): the credentials
 * exist, an admin chose to pause them. Every `get*Config()` resolver
 * calls this right after reading the secret, so every Gateway call
 * fails closed with a clear reason instead of quietly using stale
 * credentials an admin meant to stop.
 */
export class IntegrationDisabledError extends Error {
  constructor(businessId: string, provider: IntegrationProvider) {
    super(`The ${provider} integration for business ${businessId} has been disabled in Admin > Settings > Integrations.`);
    this.name = 'IntegrationDisabledError';
  }
}

/** `enabled` absent means enabled — every integration configured before this feature existed. */
export function assertIntegrationEnabled(
  businessId: string,
  provider: IntegrationProvider,
  secret: IntegrationSecretMeta,
): void {
  if (secret.enabled === false) {
    throw new IntegrationDisabledError(businessId, provider);
  }
}
