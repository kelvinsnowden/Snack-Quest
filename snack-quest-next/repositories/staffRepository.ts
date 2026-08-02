import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, StaffProfile } from '@/types';

/**
 * `staffProfiles/{uid}` reads/writes (TDD §8, § Admin auth
 * foundation). Existence of a document here — not merely a `roles`
 * entry on `users/{uid}` — is what `staffAuthService.establishSession()`
 * treats as proof of "this uid is provisioned staff," matching
 * `firestore.rules`' own `super_admin`-only write gate on this
 * collection.
 */

const COLLECTION = 'staffProfiles';

export type StaffProfileInput = Omit<StaffProfile, keyof AuditFields>;

class StaffRepository {
  async findById(uid: string): Promise<StaffProfile | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(uid).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as StaffProfile;
    return data.deletedAt ? null : data;
  }

  async listByBusiness(businessId: string): Promise<{ id: string; data: StaffProfile }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .get();
    return snapshot.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as StaffProfile }))
      .filter((entry) => !entry.data.deletedAt);
  }

  async create(uid: string, data: StaffProfileInput, actor: string): Promise<void> {
    const now = FieldValue.serverTimestamp();
    await adminFirestore
      .collection(COLLECTION)
      .doc(uid)
      .set({
        ...data,
        createdAt: now,
        updatedAt: now,
        createdBy: actor,
        updatedBy: actor,
        deletedAt: null,
      });
  }

  /** § Staff Management — role/department edits, never `businessId` (a staff member never moves tenants). */
  async update(uid: string, patch: Partial<Pick<StaffProfile, 'role' | 'department' | 'permissions'>>, actor: string): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(uid)
      .update({ ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
  }

  /** § Staff Management — soft delete, matching `findById`/`listByBusiness`'s existing `deletedAt` filter. The Auth account is separately disabled by the Service so a removed staffer truly can't sign in even with a valid ID token. */
  async softDelete(uid: string, actor: string): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(uid)
      .update({ deletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
  }
}

export const staffRepository = new StaffRepository();
