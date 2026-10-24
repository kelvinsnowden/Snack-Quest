import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { VendingOrderMeeting } from '@/types/vendingOrderMeeting';

const COLLECTION = 'vendingOrderMeetings';
/** One doc per booked meeting start, id = start ms — what stops two people booking the same time. */
const SLOTS = 'vendingOrderMeetingSlots';

export class MeetingSlotTakenError extends Error {
  constructor() {
    super('That time was just taken. Please pick another.');
    this.name = 'MeetingSlotTakenError';
  }
}

export type OrderMeetingInput = Omit<VendingOrderMeeting, 'createdAt' | 'updatedAt'>;

/** `meet_2547…` — one meeting per number, so booking again moves it. */
export function orderMeetingDocId(phone: string): string {
  return `meet_${phone.replace(/\D/g, '')}`;
}

class VendingOrderMeetingRepository {
  /**
   * Books the meeting, atomically: claims the slot (failing if someone
   * else holds it) and frees this number's previous slot when it is a
   * move. Returns the previous start when it was a move, else null.
   */
  async book(meeting: OrderMeetingInput): Promise<{ id: string; previousAtMs: number | null }> {
    const id = orderMeetingDocId(meeting.phone);
    const meetingRef = adminFirestore.collection(COLLECTION).doc(id);
    const slotRef = adminFirestore.collection(SLOTS).doc(String(meeting.atMs));
    const previousAtMs = await adminFirestore.runTransaction(async (tx) => {
      const [meetingSnap, slotSnap] = await Promise.all([tx.get(meetingRef), tx.get(slotRef)]);
      if (slotSnap.exists && (slotSnap.data() as { meetingId: string }).meetingId !== id) throw new MeetingSlotTakenError();
      const previous = meetingSnap.exists ? (meetingSnap.data() as VendingOrderMeeting).atMs : null;
      if (previous !== null && previous !== meeting.atMs) {
        tx.delete(adminFirestore.collection(SLOTS).doc(String(previous)));
      }
      tx.set(slotRef, { meetingId: id, atMs: meeting.atMs });
      const now = FieldValue.serverTimestamp();
      tx.set(meetingRef, { ...meeting, updatedAt: now, ...(meetingSnap.exists ? {} : { createdAt: now }) }, { merge: true });
      return previous;
    });
    return { id, previousAtMs };
  }

  /** Meeting starts already booked from `fromMs` on. Single-field range, so no composite index. */
  async takenSlots(fromMs: number): Promise<Set<number>> {
    const snapshot = await adminFirestore.collection(SLOTS).where('atMs', '>=', fromMs).get();
    return new Set(snapshot.docs.map((doc) => (doc.data() as { atMs: number }).atMs));
  }

  /** Meetings starting from `fromMs` on, soonest first. */
  async listFrom(fromMs: number): Promise<{ id: string; data: VendingOrderMeeting }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('atMs', '>=', fromMs).orderBy('atMs').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as VendingOrderMeeting }));
  }
}

export const vendingOrderMeetingRepository = new VendingOrderMeetingRepository();
export { VendingOrderMeetingRepository };
