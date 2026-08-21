import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { SmsOptOut, SmsOptOutSource } from '@/types';

/**
 * `smsOptOuts` reads/writes — the marketing-SMS opt-out register (see
 * `types/smsOptOut.ts` for why it is its own collection keyed by phone
 * number). Persistence only, same discipline as every other Repository:
 * whether a send should consult the register is `MarketingSmsService`'s
 * decision, not this class's.
 */

const COLLECTION = 'smsOptOuts';

function docId(businessId: string, phoneNumber: string): string {
  return `${businessId}:${phoneNumber}`;
}

export interface RecordOptOutInput {
  businessId: string;
  /** Already normalised to `254…` by the caller — see `SmsOptOut.phoneNumber`. */
  phoneNumber: string;
  source: SmsOptOutSource;
  recordedBy?: string | null;
  note?: string | null;
}

class SmsOptOutRepository {
  /**
   * Idempotent by construction: `set()` on a deterministic id, so a
   * customer who taps the link in three different messages ends up on
   * the register once. Re-recording deliberately refreshes `optedOutAt`
   * and `source` rather than preserving the first — the most recent
   * request is the one that describes their current intent, and a
   * customer re-opting-out after an admin opted them back in should
   * leave the register saying so.
   */
  async recordOptOut(input: RecordOptOutInput): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(docId(input.businessId, input.phoneNumber))
      .set({
        businessId: input.businessId,
        phoneNumber: input.phoneNumber,
        optedOutAt: FieldValue.serverTimestamp(),
        source: input.source,
        recordedBy: input.recordedBy ?? null,
        note: input.note ?? null,
      });
  }

  /** Removes a number from the register. The caller writes the `auditLogs` entry — see `types/smsOptOut.ts` on why the reversal's paper trail lives there rather than as a second state here. */
  async removeOptOut(businessId: string, phoneNumber: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(docId(businessId, phoneNumber)).delete();
  }

  async isOptedOut(businessId: string, phoneNumber: string): Promise<boolean> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(docId(businessId, phoneNumber)).get();
    return snapshot.exists;
  }

  async findOne(businessId: string, phoneNumber: string): Promise<SmsOptOut | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(docId(businessId, phoneNumber)).get();
    return snapshot.exists ? (snapshot.data() as SmsOptOut) : null;
  }

  /**
   * Every opted-out number for one business, as a Set for O(1) filtering
   * of a recipient list.
   *
   * One query for the whole register rather than a per-recipient
   * existence check, because a campaign resolves hundreds of recipients
   * and the register is small — it only ever holds people who asked to
   * leave, which is a fraction of a fraction of customers. An equality
   * filter alone needs no composite index.
   */
  async listOptedOutNumbers(businessId: string): Promise<Set<string>> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).get();
    return new Set(snapshot.docs.map((doc) => (doc.data() as SmsOptOut).phoneNumber));
  }

  /** § Admin: SMS opt-outs — the register as rows, newest first, for the staff-facing list. */
  async listByBusiness(businessId: string, limit = 200): Promise<SmsOptOut[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .orderBy('optedOutAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => doc.data() as SmsOptOut);
  }

  async countByBusiness(businessId: string): Promise<number> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .count()
      .get();
    return snapshot.data().count;
  }
}

export const smsOptOutRepository = new SmsOptOutRepository();
export { SmsOptOutRepository };
