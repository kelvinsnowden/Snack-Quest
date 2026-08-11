import 'server-only';

import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { assertIntegrationEnabled } from '../shared/assertEnabled';

export interface TiktokConfig {
  pixelCode: string;
  accessToken: string;
  /** From Events Manager → Test Events — lets `testTiktokConnection` send a real event that's quarantined from real ad reporting. Null when not configured yet. */
  testEventCode: string | null;
}

export async function getTiktokConfig(businessId: string): Promise<TiktokConfig> {
  const secret = await businessIntegrationSecretRepository.get(businessId, 'tiktok');
  assertIntegrationEnabled(businessId, 'tiktok', secret);
  return {
    pixelCode: secret.pixelCode,
    accessToken: secret.accessToken,
    testEventCode: secret.testEventCode ?? null,
  };
}
