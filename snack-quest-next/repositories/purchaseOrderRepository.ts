import 'server-only';

import { FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, PurchaseOrder, PurchaseOrderAuditEntry, PurchaseOrderStatus } from '@/types';

const COLLECTION = 'purchaseOrders';

export type PurchaseOrderInput = Omit<PurchaseOrder, keyof AuditFields>;

/** Same real-server-timestamp-for-an-arrayUnion-entry pattern as `withdrawalRepository.ts`'s `auditEntry()` — see that function's own comment for why `Timestamp.now()`, not `FieldValue.serverTimestamp()`, is correct here. */
export function auditEntry(action: string, actorId: string, note?: string): PurchaseOrderAuditEntry {
  return {
    action,
    actorId,
    at: Timestamp.now() as unknown as PurchaseOrderAuditEntry['at'],
    ...(note !== undefined ? { note } : {}),
  };
}

class PurchaseOrderRepository {
  async create(input: PurchaseOrderInput, actor: string): Promise<string> {
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

  async findById(businessId: string, purchaseOrderId: string): Promise<PurchaseOrder | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(purchaseOrderId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as PurchaseOrder;
    return data.businessId === businessId ? data : null;
  }

  /** Every status transition (mark ordered, cancel) — sets the given fields, appends one audit entry, stamps updatedAt/updatedBy. Same shape as `withdrawalRepository.applyTransition`. */
  async applyTransition(
    purchaseOrderId: string,
    fields: Partial<Omit<PurchaseOrder, keyof AuditFields | 'auditTrail'>>,
    entry: PurchaseOrderAuditEntry,
    actor: string,
  ): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(purchaseOrderId)
      .update({
        ...fields,
        auditTrail: FieldValue.arrayUnion(entry),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor,
      });
  }

  /** Same transition write, usable inside `PurchaseOrderService.receivePurchaseOrder()`'s transaction alongside the batches/movements/stock it writes atomically. */
  applyTransitionInTransaction(
    tx: Transaction,
    purchaseOrderId: string,
    fields: Partial<Omit<PurchaseOrder, keyof AuditFields | 'auditTrail'>>,
    entry: PurchaseOrderAuditEntry,
    actor: string,
  ): void {
    const ref = adminFirestore.collection(COLLECTION).doc(purchaseOrderId);
    tx.update(ref, {
      ...fields,
      auditTrail: FieldValue.arrayUnion(entry),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
  }

  /** Newest first. */
  async listByBusiness(
    businessId: string,
    options: { status?: PurchaseOrderStatus; limit?: number; cursor?: string } = {},
  ): Promise<{ purchaseOrders: { id: string; data: PurchaseOrder }[]; nextCursor: string | null }> {
    const pageSize = options.limit ?? 25;
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId) as FirebaseFirestore.Query;

    if (options.status) {
      query = query.where('status', '==', options.status);
    }
    query = query.orderBy('createdAt', 'desc').limit(pageSize + 1);

    if (options.cursor) {
      const cursorDoc = await adminFirestore.collection(COLLECTION).doc(options.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, pageSize);
    const hasMore = snapshot.docs.length > pageSize;

    return {
      purchaseOrders: docs.map((doc) => ({ id: doc.id, data: doc.data() as PurchaseOrder })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }
}

export const purchaseOrderRepository = new PurchaseOrderRepository();
