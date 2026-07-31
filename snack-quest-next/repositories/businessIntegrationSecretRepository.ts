import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { IntegrationProvider, IntegrationSecretMap } from '@/types';

/**
 * `businesses/{businessId}/integrationSecrets/{provider}` reads/writes
 * (see `types/business.ts`). Every Gateway config module resolves its
 * per-tenant credentials through this, never through `process.env` —
 * `process.env` is only ever touched by seed scripts, which write the
 * *first* tenant's (Snack Quest's) credentials in here once, exactly
 * like any other tenant would provide their own.
 */

export class IntegrationSecretNotFoundError extends Error {
  constructor(businessId: string, provider: IntegrationProvider) {
    super(
      `No ${provider} integration configured for business ${businessId}. Run the relevant seed script or configure it via the admin tooling.`,
    );
    this.name = 'IntegrationSecretNotFoundError';
  }
}

class BusinessIntegrationSecretRepository {
  async get<P extends IntegrationProvider>(
    businessId: string,
    provider: P,
  ): Promise<IntegrationSecretMap[P]> {
    const snapshot = await adminFirestore
      .collection('businesses')
      .doc(businessId)
      .collection('integrationSecrets')
      .doc(provider)
      .get();
    if (!snapshot.exists) {
      throw new IntegrationSecretNotFoundError(businessId, provider);
    }
    return snapshot.data() as IntegrationSecretMap[P];
  }

  async set<P extends IntegrationProvider>(
    businessId: string,
    provider: P,
    secret: IntegrationSecretMap[P],
  ): Promise<void> {
    await adminFirestore
      .collection('businesses')
      .doc(businessId)
      .collection('integrationSecrets')
      .doc(provider)
      .set({ ...secret, updatedAt: FieldValue.serverTimestamp() });
  }
}

export const businessIntegrationSecretRepository = new BusinessIntegrationSecretRepository();
