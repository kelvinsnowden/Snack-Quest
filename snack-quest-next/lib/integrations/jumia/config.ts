import 'server-only';

import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';

export interface JumiaConfig {
  apiKey: string;
  merchantId: string;
  baseUrl: string;
}

export async function getJumiaConfig(businessId: string): Promise<JumiaConfig> {
  const secret = await businessIntegrationSecretRepository.get(businessId, 'jumia');
  return {
    apiKey: secret.apiKey,
    merchantId: secret.merchantId,
    baseUrl: secret.baseUrl ?? 'https://api.jumia.com/logistics/v1',
  };
}
