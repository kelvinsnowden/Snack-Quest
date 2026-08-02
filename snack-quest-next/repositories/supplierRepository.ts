import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, Supplier } from '@/types';

const COLLECTION = 'suppliers';

export type SupplierInput = Omit<Supplier, keyof AuditFields>;

/**
 * `suppliers` reads/writes (§ Inventory: batches, purchase orders,
 * suppliers, movements, low-stock alerts, expiry, audit trail).
 */
class SupplierRepository {
  async create(input: SupplierInput, actor: string): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
      deletedAt: null,
    });
    return ref.id;
  }

  async findById(businessId: string, supplierId: string): Promise<Supplier | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(supplierId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as Supplier;
    return data.businessId === businessId ? data : null;
  }

  async update(supplierId: string, patch: Partial<SupplierInput>, actor: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(supplierId).update({
      ...patch,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
  }

  /** Newest first. `activeOnly` powers the supplier picker on "New purchase order" — a discontinued supplier stays visible everywhere else (its own detail page, past POs) but drops out of that one list. */
  async listByBusiness(
    businessId: string,
    options: { activeOnly?: boolean } = {},
  ): Promise<{ id: string; data: Supplier }[]> {
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId) as FirebaseFirestore.Query;
    if (options.activeOnly) {
      query = query.where('isActive', '==', true);
    }
    query = query.orderBy('createdAt', 'desc');

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Supplier }));
  }
}

export const supplierRepository = new SupplierRepository();
