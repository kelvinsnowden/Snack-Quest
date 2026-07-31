import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, Package } from '@/types';

/**
 * `packages` reads/writes (PLATFORM_ARCHITECTURE_V2.md §5). Minimal —
 * just what the Conversation Domain's box-selection step needs.
 */

const COLLECTION = 'packages';

export type PackageInput = Omit<Package, keyof AuditFields>;

class PackageRepository {
  /**
   * Ordered by price ascending — not cosmetic. The Conversation
   * Domain presents these as a numbered list ("1. Starter Box... 2.
   * Deluxe Box...") and a customer's reply of "1" is resolved back to
   * a package by that same order, so an unordered query here would
   * make the numbered options a customer sees unstable between reads.
   */
  async listActive(): Promise<{ id: string; data: Package }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('isActive', '==', true)
      .orderBy('priceKes', 'asc')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Package }));
  }

  async create(data: PackageInput, actor: string): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...data,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
      deletedAt: null,
    });
    return ref.id;
  }
}

export const packageRepository = new PackageRepository();
