import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, VendingRefund, VendingRefundAuditEntry } from '@/types';

const COLLECTION = 'vendingRefunds';

export type VendingRefundInput = Omit<VendingRefund, keyof AuditFields | 'auditTrail'>;

export function vendingRefundAuditEntry(action: string, actorId: string, note?: string): VendingRefundAuditEntry {
  return { action, actorId, at: Timestamp.now() as unknown as VendingRefundAuditEntry['at'], ...(note !== undefined ? { note } : {}) };
}

/** A refund for this sale is already on its way or done — starting another could pay the customer twice. */
export class VendingRefundInFlightError extends Error {
  constructor(transactionId: string) {
    super(`Sale ${transactionId} already has a refund in progress or completed.`);
    this.name = 'VendingRefundInFlightError';
  }
}

class VendingRefundRepository {
  /**
   * Creates a refund attempt only if nothing for the same sale is already
   * under way or done — checked and written in one transaction, so two
   * people pressing "Refund" at once can never both start one.
   *
   * `processing` and `succeeded` always block. A `pending` attempt (a
   * reversal written but never confirmed as sent) blocks until it is
   * `pendingStaleAfterMs` old; after that a person who has checked the
   * M-Pesa statement may record the refund themselves. A reversal never
   * passes a stale `pending` — whether that request reached Safaricom is
   * unknown, and a second one could pay the customer twice.
   */
  async createIfNoneInFlight(input: VendingRefundInput, firstEntry: VendingRefundAuditEntry, actor: string, options: { pendingStaleAfterMs?: number; now?: number } = {}): Promise<string> {
    const collection = adminFirestore.collection(COLLECTION);
    const ref = collection.doc();
    const staleAfter = options.pendingStaleAfterMs ?? Number.POSITIVE_INFINITY;
    const now = options.now ?? Date.now();
    await adminFirestore.runTransaction(async (tx) => {
      const existing = await tx.get(collection.where('businessId', '==', input.businessId).where('transactionId', '==', input.transactionId));
      const blocking = existing.docs.some((doc) => {
        const status = doc.get('status') as string;
        if (status === 'processing' || status === 'succeeded') return true;
        if (status !== 'pending') return false;
        const createdAt = doc.get('createdAt') as Timestamp | undefined;
        return !createdAt || now - createdAt.toMillis() < staleAfter;
      });
      if (blocking) {
        throw new VendingRefundInFlightError(input.transactionId);
      }
      const stamp = FieldValue.serverTimestamp();
      tx.set(ref, { ...input, auditTrail: [firstEntry], createdAt: stamp, updatedAt: stamp, createdBy: actor, updatedBy: actor, deletedAt: null });
    });
    return ref.id;
  }

  async listByTransaction(businessId: string, transactionId: string): Promise<{ id: string; data: VendingRefund }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).where('transactionId', '==', transactionId).get();
    return snapshot.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as VendingRefund }))
      .sort((a, b) => (a.data.createdAt?.toMillis?.() ?? 0) - (b.data.createdAt?.toMillis?.() ?? 0));
  }

  async findByOriginatorConversationId(businessId: string, originatorConversationId: string): Promise<{ id: string; data: VendingRefund } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('reversalOriginatorConversationId', '==', originatorConversationId)
      .limit(1)
      .get();
    return snapshot.empty ? null : { id: snapshot.docs[0].id, data: snapshot.docs[0].data() as VendingRefund };
  }

  async applyTransition(refundId: string, fields: Partial<Omit<VendingRefund, keyof AuditFields | 'auditTrail'>>, entry: VendingRefundAuditEntry, actor: string): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(refundId)
      .update({ ...fields, auditTrail: FieldValue.arrayUnion(entry), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
  }
}

export const vendingRefundRepository = new VendingRefundRepository();
