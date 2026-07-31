import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { ReferralAttribution } from '@/types';

const COLLECTION = 'referralAttributions';

export interface ReferralAttributionInput {
  businessId: string;
  referralLinkId: string;
  creatorId: string;
  orderId: string;
  conversationId: string;
  discountKes: number;
  commissionKes: number;
}

export function createInTransaction(tx: Transaction, input: ReferralAttributionInput): void {
  const ref = adminFirestore.collection(COLLECTION).doc();
  tx.set(ref, {
    ...input,
    status: 'awarded',
    createdAt: FieldValue.serverTimestamp(),
  });
}

class ReferralAttributionRepository {
  /**
   * Admin: Referrals — the commission ledger (§ Admin: Referrals),
   * newest first. Every attribution here is already `status:
   * 'awarded'` — commissions are credited automatically the instant
   * an order uses a valid code (`ReferralService.awardCommission()`),
   * there is no pending-approval state in this architecture. This is
   * the real oversight view: what got credited, to whom, for which
   * order — not an approval queue that doesn't exist.
   */
  async listByBusiness(
    businessId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ attributions: { id: string; data: ReferralAttribution }[]; nextCursor: string | null }> {
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
      attributions: docs.map((doc) => ({ id: doc.id, data: doc.data() as ReferralAttribution })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }
}

export const referralAttributionRepository = new ReferralAttributionRepository();
