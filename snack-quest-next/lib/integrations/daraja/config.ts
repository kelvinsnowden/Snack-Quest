import 'server-only';

import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
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
  passkey: string;
  callbackUrl: string;
  baseUrl: string;
}

function toBaseUrl(secret: DarajaIntegrationSecret): string {
  return secret.env === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

export async function getDarajaConfig(businessId: string): Promise<DarajaConfig> {
  const secret = await businessIntegrationSecretRepository.get(businessId, 'daraja');
  return {
    consumerKey: secret.consumerKey,
    consumerSecret: secret.consumerSecret,
    shortcode: secret.shortcode,
    passkey: secret.passkey,
    callbackUrl: secret.callbackUrl,
    baseUrl: toBaseUrl(secret),
  };
}
