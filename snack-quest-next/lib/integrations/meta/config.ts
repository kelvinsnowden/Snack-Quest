import 'server-only';

import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { assertIntegrationEnabled } from '../shared/assertEnabled';

export interface MetaConfig {
  pixelId: string;
  accessToken: string;
  apiVersion: string;
}

export async function getMetaConfig(businessId: string): Promise<MetaConfig> {
  const secret = await businessIntegrationSecretRepository.get(businessId, 'meta');
  assertIntegrationEnabled(businessId, 'meta', secret);
  return {
    pixelId: secret.pixelId,
    accessToken: secret.accessToken,
    apiVersion: secret.apiVersion ?? 'v21.0',
  };
}
