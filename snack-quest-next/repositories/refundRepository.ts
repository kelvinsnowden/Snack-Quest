import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, Refund, RefundAuditEntry, RefundStatus } from '@/types';

const COLLECTION = 'refunds';

export type RefundInput = Omit<Refund, keyof AuditFields>;

/** Same real-server-timestamp-for-an-arrayUnion-entry pattern as `withdrawalRepository.ts`'s `auditEntry()` — see that function's own comment for why `Timestamp.now()`, not `FieldValue.serverTimestamp()`, is correct here. */
export function refundAuditEntry(action: string, actorId: string, note?: string): RefundAuditEntry {
  return {
    action,
    actorId,
    at: Timestamp.now() as unknown as RefundAuditEntry['at'],
    ...(note !== undefined ? { note } : {}),
  };
}

class RefundRepository {
  async create(input: RefundInput, actor: string): Promise<string> {
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

  async findById(businessId: string, refundId: string): Promise<Refund | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(refundId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as Refund;
    return data.businessId === businessId ? data : null;
  }

  /** Every refund attempt for a given order — how `RefundService.requestRefund` checks a refund isn't already in flight or done before starting a new one. */
  async listByOrderId(businessId: string, orderId: string): Promise<{ id: string; data: Refund }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('orderId', '==', orderId)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Refund }));
  }

  /** Matches a reversal async result callback back to the refund that triggered it — see `Refund.reversalOriginatorConversationId`. */
  async findByOriginatorConversationId(
    businessId: string,
    originatorConversationId: string,
  ): Promise<{ id: string; data: Refund } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('reversalOriginatorConversationId', '==', originatorConversationId)
      .limit(1)
      .get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, data: doc.data() as Refund };
  }

  /** Every status transition goes through here: sets the given fields, appends one audit entry, stamps updatedAt/updatedBy — same discipline as `withdrawalRepository.applyTransition`. */
  async applyTransition(
    refundId: string,
    fields: Partial<Omit<Refund, keyof AuditFields | 'auditTrail'>>,
    entry: RefundAuditEntry,
    actor: string,
  ): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(refundId)
      .update({
        ...fields,
        auditTrail: FieldValue.arrayUnion(entry),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor,
      });
  }

  /** The Finance workspace's refund ledger (§ Finance workspace) — every refund for the business, newest first, optionally narrowed to one status. */
  async listByBusiness(
    businessId: string,
    options: { status?: RefundStatus; limit?: number; cursor?: string } = {},
  ): Promise<{ refunds: { id: string; data: Refund }[]; nextCursor: string | null }> {
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
      refunds: docs.map((doc) => ({ id: doc.id, data: doc.data() as Refund })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }
}

export const refundRepository = new RefundRepository();
