import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type {
  ManualPaymentRecord,
  PaymentAttempt,
  PaymentAttemptStatus,
  PaymentIntent,
  PaymentIntentStatus,
} from '@/types';

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

  /** Recent intents for a business matching any of the given statuses, newest first — the Operations dashboard's payment-failures and abandoned-checkout tiles (§ Phase 5). */
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

  /**
   * The still-unsettled intent for one frozen checkout, if there is one
   * (§ payment auto-recovery). Scoped to `'processing'` because that is
   * the only state worth recovering: `'pending'` never reached
   * Safaricom, and anything terminal is already decided.
   *
   * Keyed on the SNAPSHOT, not the conversation, and that distinction
   * is the whole point. A conversation is reused for a phone number and
   * every abandoned attempt deliberately leaves its intent `processing`
   * for the sweep to resolve later (see `startWebCheckout`), so one
   * conversation accumulates many. Looking one up by conversation
   * returns an arbitrary one of those — which is how recovering "the
   * customer's payment" once resurrected a day-old attempt and turned
   * it into a second order, each carrying its own snapshot so the
   * duplicate guard in `completeOrder` never saw them as the same sale.
   * A snapshot is exactly one checkout, so this can only ever find the
   * payment that checkout is waiting on.
   */
  async findProcessingBySnapshotId(
    businessId: string,
    snapshotId: string,
  ): Promise<{ id: string; data: PaymentIntent } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('conversationCheckoutSnapshotId', '==', snapshotId)
      .where('status', '==', 'processing')
      .limit(1)
      .get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, data: doc.data() as PaymentIntent };
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

  /**
   * Settles an intent that never went through Daraja (§ super-admin
   * manual payment orders). One `update()` writes both the record and
   * the terminal status, so an intent can never be left `'succeeded'`
   * with no evidence of who said so attached to it.
   *
   * Guarded with a `create`-style precondition rather than a blind
   * write: `expectedCurrentStatus` is checked inside a transaction, so
   * two super admins recording the same payment at once cannot both
   * proceed. The caller decides what a rejection means; this returns
   * `false` rather than throwing, the same shape `create` uses for a
   * duplicate.
   */
  async recordManualPayment(
    intentId: string,
    manualPayment: Omit<ManualPaymentRecord, 'recordedAt'>,
    expectedCurrentStatus: PaymentIntentStatus,
  ): Promise<{ settled: boolean }> {
    const ref = adminFirestore.collection(COLLECTION).doc(intentId);
    return adminFirestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) {
        return { settled: false };
      }
      if ((snapshot.data() as PaymentIntent).status !== expectedCurrentStatus) {
        return { settled: false };
      }
      tx.update(ref, {
        status: 'succeeded' satisfies PaymentIntentStatus,
        manualPayment: { ...manualPayment, recordedAt: Timestamp.now() },
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { settled: true };
    });
  }

  /**
   * The intent's own copy of a corrected manual payment
   * (§ correcting a manually recorded payment). Written alongside the
   * order's copy — the two must never disagree about how money
   * arrived, since reconciliation reads both.
   */
  async updateManualPayment(intentId: string, manualPayment: ManualPaymentRecord): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(intentId).update({
      manualPayment,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  async addAttempt(
    intentId: string,
    attempt: Omit<PaymentAttempt, 'initiatedAt' | 'resolvedAt' | 'queryAttemptCount'>,
  ): Promise<string> {
    const ref = await adminFirestore
      .collection(COLLECTION)
      .doc(intentId)
      .collection('attempts')
      .add({
        ...attempt,
        initiatedAt: FieldValue.serverTimestamp(),
        resolvedAt: null,
        queryAttemptCount: 0,
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

  /**
   * The most recent attempt for an intent, if it's still awaiting a
   * result (§ Daraja Production Integration Verification Audit
   * §2.4/§7 — the STK Push Query reconciliation sweep needs this
   * attempt's `checkoutRequestId` to ask Daraja what happened to it).
   * No filter/composite index needed: a single intent's `attempts`
   * subcollection is a handful of documents at most (one per retried
   * PAY reply), so ordering by `initiatedAt` alone — Firestore's
   * automatic single-field index — and taking the newest is enough;
   * `null` means either no attempts exist yet or the newest one
   * already resolved (nothing to query).
   */
  async getPendingAttempt(
    intentId: string,
  ): Promise<{ attemptId: string; checkoutRequestId: string; queryAttemptCount: number } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .doc(intentId)
      .collection('attempts')
      .orderBy('initiatedAt', 'desc')
      .limit(1)
      .get();
    if (snapshot.empty) {
      return null;
    }
    const latest = snapshot.docs[0];
    const data = latest.data() as PaymentAttempt;
    if (data.status !== 'initiated') {
      return null;
    }
    return {
      attemptId: latest.id,
      checkoutRequestId: data.checkoutRequestId,
      queryAttemptCount: data.queryAttemptCount ?? 0,
    };
  }

  /** Bumps `queryAttemptCount` after each STK Push Query call the reconciliation sweep makes against this attempt — the sweep's own retry-limit counter (§ Daraja Production Integration Verification Audit §2.4/§7), separate from Daraja's own request/response cycle. */
  async incrementQueryAttemptCount(intentId: string, attemptId: string): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(intentId)
      .collection('attempts')
      .doc(attemptId)
      .update({ queryAttemptCount: FieldValue.increment(1) });
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
