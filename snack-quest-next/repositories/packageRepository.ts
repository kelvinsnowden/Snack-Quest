import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, Package } from '@/types';

export class OutOfStockError extends Error {
  constructor(packageId: string) {
    super(`Package ${packageId} is out of stock`);
    this.name = 'OutOfStockError';
  }
}

/**
 * Decrements stock inside an existing transaction, if this package
 * tracks stock at all. Undefined `stockCount` means unlimited — most
 * packages today, since no real per-box stock ceiling is set — and is
 * a silent no-op, not an error. Exported as a function (not a class
 * method) because it must run inside `OrderService`'s own transaction
 * alongside order creation, using the same `Transaction` object.
 */
export async function reserveStockInTransaction(
  tx: Transaction,
  packageId: string,
): Promise<void> {
  const ref = adminFirestore.collection('packages').doc(packageId);
  const snapshot = await tx.get(ref);
  const data = snapshot.data() as Package | undefined;
  if (!data || data.stockCount === undefined) {
    return;
  }
  if (data.stockCount <= 0) {
    throw new OutOfStockError(packageId);
  }
  tx.update(ref, { stockCount: data.stockCount - 1 });
}

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
