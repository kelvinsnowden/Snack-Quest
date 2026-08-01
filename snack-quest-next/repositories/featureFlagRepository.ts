import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { FeatureFlag } from '@/types';

function collection(businessId: string) {
  return adminFirestore.collection('businesses').doc(businessId).collection('featureFlags');
}

export interface UpsertFeatureFlagInput {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
}

class FeatureFlagRepository {
  async listByBusiness(businessId: string): Promise<{ id: string; data: FeatureFlag }[]> {
    const snapshot = await collection(businessId).orderBy('key', 'asc').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as FeatureFlag }));
  }

  async get(businessId: string, key: string): Promise<FeatureFlag | null> {
    const snapshot = await collection(businessId).doc(key).get();
    return snapshot.exists ? (snapshot.data() as FeatureFlag) : null;
  }

  /** Upsert — a flag's first `set()` creates it, matching every other business-config write pattern in this codebase (e.g. `businessIntegrationSecretRepository.set()`). */
  async set(businessId: string, input: UpsertFeatureFlagInput, actor: string): Promise<void> {
    const now = FieldValue.serverTimestamp();
    const ref = collection(businessId).doc(input.key);
    const existing = await ref.get();
    await ref.set(
      {
        key: input.key,
        name: input.name,
        description: input.description,
        enabled: input.enabled,
        createdAt: existing.exists ? existing.data()!.createdAt : now,
        updatedAt: now,
        updatedBy: actor,
      },
      { merge: true },
    );
  }

  /** Flips only `enabled` — the common case (an admin toggling a switch), without needing to re-send `name`/`description`. */
  async setEnabled(businessId: string, key: string, enabled: boolean, actor: string): Promise<void> {
    await collection(businessId).doc(key).update({
      enabled,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
  }
}

export const featureFlagRepository = new FeatureFlagRepository();
