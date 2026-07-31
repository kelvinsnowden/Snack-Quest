import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';

const COLLECTION = 'referralAttributions';

export interface ReferralAttributionInput {
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
