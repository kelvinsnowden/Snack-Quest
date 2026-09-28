import 'server-only';

import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';

const COLLECTION = 'paymentInitiations';

export interface PaymentInitiationResult {
  checkoutRequestId: string;
  merchantRequestId: string;
  customerMessage: string;
  cartRef: string;
  transactions: { id: string; transactionRef: string; slotId: string; amountKes: number }[];
}

export interface PaymentInitiation {
  businessId: string;
  machineId: string;
  /** Hash of phone + cart: an explicit key sent again with a different cart is a client bug, surfaced. */
  fingerprint: string;
  explicitKey: boolean;
  status: 'initiating' | 'initiated' | 'failed';
  result: PaymentInitiationResult | null;
  createdAt: Timestamp;
  /** After this a new request with the same key starts a new payment. Also the TTL field. */
  expiresAt: Timestamp;
}

export type ClaimOutcome = { claimed: true } | { claimed: false; existing: PaymentInitiation };

/**
 * `paymentInitiations/{hash}` — one per attempt to start an M-Pesa
 * prompt, so a retried request (kiosk timeout, double tap, flaky
 * network) returns the first prompt instead of sending a second one the
 * customer could also approve.
 */
class PaymentInitiationRepository {
  docId(businessId: string, machineId: string, key: string): string {
    return createHash('sha256').update(`${businessId}\u0000${machineId}\u0000${key}`).digest('hex');
  }

  /**
   * Claims the key, atomically. Taken over only when the previous claim
   * failed or expired — an in-flight or completed one is returned
   * instead, so two concurrent retries can never both push.
   */
  async claim(id: string, data: Omit<PaymentInitiation, 'status' | 'result' | 'createdAt' | 'expiresAt'>, ttlMs: number, now = Date.now()): Promise<ClaimOutcome> {
    const ref = adminFirestore.collection(COLLECTION).doc(id);
    return adminFirestore.runTransaction(async (tx) => {
      const existing = (await tx.get(ref)).data() as PaymentInitiation | undefined;
      if (existing && existing.status !== 'failed' && existing.expiresAt.toMillis() > now) {
        return { claimed: false, existing } as const;
      }
      tx.set(ref, { ...data, status: 'initiating', result: null, createdAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + ttlMs) });
      return { claimed: true } as const;
    });
  }

  /** Releases a claim so the same request can start a fresh payment (the previous one is no longer pending). */
  async release(id: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(id).update({ status: 'failed' });
  }

  async complete(id: string, result: PaymentInitiationResult): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(id).update({ status: 'initiated', result });
  }

  async fail(id: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(id).update({ status: 'failed' });
  }
}

export const paymentInitiationRepository = new PaymentInitiationRepository();
