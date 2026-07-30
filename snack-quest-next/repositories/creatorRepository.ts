import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, CreatorProfile } from '@/types';

/**
 * `creatorProfiles` reads/writes (TDD §4/§8). This is the reference
 * Repository every later repository is reviewed against: persistence
 * only, no business rules, no decision about *whether* a write should
 * happen — that belongs to a Service.
 */

const COLLECTION = 'creatorProfiles';

export type CreatorProfileInput = Omit<CreatorProfile, keyof AuditFields>;

/**
 * updatedBy is required on every update — the Repository stamps
 * updatedAt automatically (a persistence mechanic), but actor identity
 * is a Service-layer concern the Repository never invents.
 */
export type CreatorProfileUpdate = Partial<CreatorProfileInput> & {
  updatedBy: string;
};

class CreatorRepository {
  async findById(uid: string): Promise<CreatorProfile | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(uid).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as CreatorProfile;
  }

  async create(uid: string, data: CreatorProfileInput): Promise<void> {
    const now = FieldValue.serverTimestamp();
    await adminFirestore
      .collection(COLLECTION)
      .doc(uid)
      .set({
        ...data,
        createdAt: now,
        updatedAt: now,
        createdBy: uid,
        updatedBy: uid,
        deletedAt: null,
      });
  }

  async update(uid: string, partial: CreatorProfileUpdate): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(uid)
      .update({
        ...partial,
        updatedAt: FieldValue.serverTimestamp(),
      });
  }
}

export const creatorRepository = new CreatorRepository();
