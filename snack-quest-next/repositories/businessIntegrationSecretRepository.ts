import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { decryptSecret, encryptSecret } from '@/lib/secrets/secretCipher';
import { getSecretFieldKeys } from '@/lib/integrations/fieldManifest';
import type { IntegrationProvider, IntegrationSecretMap } from '@/types';

/**
 * `businesses/{businessId}/integrationSecrets/{provider}` reads/writes
 * (see `types/business.ts`). Every Gateway config module resolves its
 * per-tenant credentials through this, never through `process.env` —
 * `process.env` is only ever touched by seed scripts, which write the
 * *first* tenant's (Snack Quest's) credentials in here once, exactly
 * like any other tenant would provide their own.
 *
 * `get`/`set` transparently encrypt/decrypt the fields the field
 * manifest marks `secret: true` (§ Integration Portal,
 * `lib/secrets/secretCipher.ts`) — every existing caller (Gateway
 * config modules, seed scripts) keeps working unchanged; they never
 * see ciphertext.
 */

export class IntegrationSecretNotFoundError extends Error {
  constructor(businessId: string, provider: IntegrationProvider) {
    super(
      `No ${provider} integration configured for business ${businessId}. Run the relevant seed script or configure it via the admin tooling.`,
    );
    this.name = 'IntegrationSecretNotFoundError';
  }
}

function applyToSecretFields<P extends IntegrationProvider>(
  provider: P,
  data: Record<string, unknown>,
  transform: (value: string) => string,
): Record<string, unknown> {
  const result = { ...data };
  for (const key of getSecretFieldKeys(provider)) {
    const value = result[key];
    if (typeof value === 'string' && value.length > 0) {
      result[key] = transform(value);
    }
  }
  return result;
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
    const data = snapshot.data() as Record<string, unknown>;
    return applyToSecretFields(provider, data, decryptSecret) as unknown as IntegrationSecretMap[P];
  }

  /** Same as `get`, but returns `null` instead of throwing when unconfigured — for status/listing callers that expect "missing" as a normal outcome. */
  async find<P extends IntegrationProvider>(
    businessId: string,
    provider: P,
  ): Promise<IntegrationSecretMap[P] | null> {
    try {
      return await this.get(businessId, provider);
    } catch (error) {
      if (error instanceof IntegrationSecretNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  async set<P extends IntegrationProvider>(
    businessId: string,
    provider: P,
    secret: IntegrationSecretMap[P],
  ): Promise<void> {
    const encrypted = applyToSecretFields(provider, secret as unknown as Record<string, unknown>, encryptSecret);
    await adminFirestore
      .collection('businesses')
      .doc(businessId)
      .collection('integrationSecrets')
      .doc(provider)
      .set({ ...encrypted, updatedAt: FieldValue.serverTimestamp() });
  }

  /** Partial update — merges `patch` onto whatever's already stored (or nothing, for a first-time setup), so the Integration Portal can save just the fields an admin actually changed. */
  async update<P extends IntegrationProvider>(
    businessId: string,
    provider: P,
    patch: Partial<IntegrationSecretMap[P]>,
  ): Promise<void> {
    const encrypted = applyToSecretFields(provider, patch as unknown as Record<string, unknown>, encryptSecret);
    await adminFirestore
      .collection('businesses')
      .doc(businessId)
      .collection('integrationSecrets')
      .doc(provider)
      .set({ ...encrypted, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  /** Records a "Test Connection" outcome (§ Integration Portal) — its own method, not `update`, since `lastTestedAt` needs a real server timestamp rather than a client-supplied value. */
  async recordTestResult(
    businessId: string,
    provider: IntegrationProvider,
    result: { status: 'success' | 'failure'; error: string | null },
  ): Promise<void> {
    await adminFirestore
      .collection('businesses')
      .doc(businessId)
      .collection('integrationSecrets')
      .doc(provider)
      .set(
        {
          lastTestedAt: FieldValue.serverTimestamp(),
          lastTestStatus: result.status,
          lastTestError: result.error,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  }
}

export const businessIntegrationSecretRepository = new BusinessIntegrationSecretRepository();
