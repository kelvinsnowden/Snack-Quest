import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { PaymentAttempt, PaymentAttemptStatus, PaymentIntent, PaymentIntentStatus } from '@/types';

/**
 * `paymentIntents` + `attempts` subcollection reads/writes
 * (PLATFORM_ARCHITECTURE_V2.md §7). Persistence only — verification
 * logic (amount match, idempotency) lives in `services/paymentService.ts`.
 */

const COLLECTION = 'paymentIntents';

export type PaymentIntentInput = Omit<
  PaymentIntent,
  'status' | 'createdAt' | 'updatedAt'
>;

class PaymentIntentRepository {
  async create(input: PaymentIntentInput): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    return ref.id;
  }

  /** Recent failed/expired intents for a business, newest first — the Operations dashboard's payment-failures tile (§ Phase 5). */
  async listByStatus(
    businessId: string,
    statuses: PaymentIntentStatus[],
    limit = 50,
  ): Promise<{ id: string; data: PaymentIntent }[]> {
    const statusSet = new Set(statuses);
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .orderBy('updatedAt', 'desc')
      .limit(500)
      .get();

    const matches = snapshot.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as PaymentIntent }))
      .filter((intent) => statusSet.has(intent.data.status));

    return matches.slice(0, limit);
  }

  async findById(intentId: string): Promise<PaymentIntent | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(intentId).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as PaymentIntent;
  }

  async updateStatus(intentId: string, status: PaymentIntentStatus): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(intentId).update({
      status,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  async addAttempt(
    intentId: string,
    attempt: Omit<PaymentAttempt, 'initiatedAt' | 'resolvedAt'>,
  ): Promise<string> {
    const ref = await adminFirestore
      .collection(COLLECTION)
      .doc(intentId)
      .collection('attempts')
      .add({
        ...attempt,
        initiatedAt: FieldValue.serverTimestamp(),
        resolvedAt: null,
      });
    return ref.id;
  }

  /**
   * Resolves a Daraja callback back to the intent it belongs to.
   * `checkoutRequestId` is unique per STK push attempt, so a
   * collection-group query across every intent's `attempts`
   * subcollection is the correct (and only) way to find it.
   */
  async findByCheckoutRequestId(
    checkoutRequestId: string,
  ): Promise<{ intentId: string; attemptId: string } | null> {
    const snapshot = await adminFirestore
      .collectionGroup('attempts')
      .where('checkoutRequestId', '==', checkoutRequestId)
      .limit(1)
      .get();
    if (snapshot.empty) {
      return null;
    }
    const attemptDoc = snapshot.docs[0];
    const intentRef = attemptDoc.ref.parent.parent;
    if (!intentRef) {
      return null;
    }
    return { intentId: intentRef.id, attemptId: attemptDoc.id };
  }

  async resolveAttempt(
    intentId: string,
    attemptId: string,
    update: {
      status: PaymentAttemptStatus;
      resultCode: number;
      resultDesc: string;
      mpesaReceiptNumber: string | null;
    },
  ): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(intentId)
      .collection('attempts')
      .doc(attemptId)
      .update({ ...update, resolvedAt: FieldValue.serverTimestamp() });
  }
}

export const paymentIntentRepository = new PaymentIntentRepository();
