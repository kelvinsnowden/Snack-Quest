import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { InvestorInterest } from '@/types/investorInterest';

const COLLECTION = 'investorInterests';

export type InvestorInterestInput = Omit<InvestorInterest, 'createdAt' | 'updatedAt' | 'status'>;

class InvestorInterestRepository {
  async create(input: InvestorInterestInput): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      status: 'new',
      createdAt: now,
      updatedAt: now,
    });
    return ref.id;
  }

  /**
   * The same person submitting twice (§ duplicate submissions).
   *
   * Matched on email, which is the one field a returning visitor types
   * identically — a phone number arrives as `0712…` one day and
   * `+254712…` the next, and a name arrives with and without a middle
   * one. Scoped to a recent window rather than all time: somebody
   * coming back a month later with a different amount in mind is a new
   * conversation, not a double tap on the submit button.
   */
  async findRecentByEmail(email: string, since: Date): Promise<{ id: string } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('email', '==', email)
      .where('createdAt', '>=', since)
      .limit(1)
      .get();
    const doc = snapshot.docs[0];
    return doc ? { id: doc.id } : null;
  }

  /**
   * How many submissions came from one origin recently — the counter
   * behind the rate limit.
   *
   * Counted server-side from the documents themselves rather than from
   * an in-memory tally, because this runs on serverless functions:
   * anything held in process memory is per-instance, resets on every
   * cold start, and would let a script through simply by arriving at a
   * new one.
   */
  async countSince(referrerHash: string, since: Date): Promise<number> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('submitterHash', '==', referrerHash)
      .where('createdAt', '>=', since)
      .count()
      .get();
    return snapshot.data().count;
  }
}

export const investorInterestRepository = new InvestorInterestRepository();
export { InvestorInterestRepository };
