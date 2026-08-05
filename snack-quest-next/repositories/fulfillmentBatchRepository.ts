import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, FulfillmentBatch } from '@/types';

const COLLECTION = 'fulfillmentBatches';

export type FulfillmentBatchInput = Omit<FulfillmentBatch, keyof AuditFields>;

/**
 * Creates a batch inside `FulfillmentBatchService.createFulfillmentBatch()`'s
 * transaction, alongside every batched order's cost/profit patch —
 * same shape as `inventoryBatchRepository.createInTransaction`: a doc
 * ref generated up front, since Admin SDK transactions allow this
 * before any read/write, followed by one `tx.set`.
 */
export function createInTransaction(
  tx: Transaction,
  input: FulfillmentBatchInput,
  actor: string,
): string {
  const ref = adminFirestore.collection(COLLECTION).doc();
  const now = FieldValue.serverTimestamp();
  tx.set(ref, {
    ...input,
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: actor,
    deletedAt: null,
  });
  return ref.id;
}

class FulfillmentBatchRepository {
  async findById(businessId: string, batchId: string): Promise<FulfillmentBatch | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(batchId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as FulfillmentBatch;
    return data.businessId === businessId ? data : null;
  }

  /** Newest first — cursor-paginated the same way as `purchaseOrderRepository.listByBusiness`. No status filter — a batch has no lifecycle to filter by. */
  async listByBusiness(
    businessId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ batches: { id: string; data: FulfillmentBatch }[]; nextCursor: string | null }> {
    const pageSize = options.limit ?? 25;
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .orderBy('createdAt', 'desc')
      .limit(pageSize + 1) as FirebaseFirestore.Query;

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
      batches: docs.map((doc) => ({ id: doc.id, data: doc.data() as FulfillmentBatch })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }
}

export const fulfillmentBatchRepository = new FulfillmentBatchRepository();
