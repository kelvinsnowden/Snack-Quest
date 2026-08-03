import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, User } from '@/types';

/**
 * `users/{uid}` reads/writes — the shared identity root every role
 * (customer/creator/staff) sits on top of (TDD §8). `roles` here is
 * the exact array copied onto the Firebase Auth custom claim that
 * Security Rules and every server-side role check trust — Firestore
 * rules restrict a signed-in user to self-creating only with
 * `roles: ['customer']` and never self-editing `roles` afterward
 * (firestore.rules), so a staff/creator `roles` value is only ever
 * set here via the Admin SDK, which this Repository always uses.
 */

const COLLECTION = 'users';

export type UserInput = Omit<User, keyof AuditFields>;

class UserRepository {
  async findById(uid: string): Promise<User | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(uid).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as User;
  }

  async create(uid: string, data: UserInput, actor: string): Promise<void> {
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

  async updateRoles(uid: string, roles: User['roles'], actor: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(uid).update({
      roles,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
  }

  async updatePhoto(uid: string, photoURL: string | null, actor: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(uid).update({
      photoURL,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
  }

  /** § Staff Management — soft delete alongside `staffRepository.softDelete`; `establishSession`/`verifySessionCookie` already reject a `deletedAt` user. */
  async softDelete(uid: string, actor: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(uid).update({
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
  }
}

export const userRepository = new UserRepository();
