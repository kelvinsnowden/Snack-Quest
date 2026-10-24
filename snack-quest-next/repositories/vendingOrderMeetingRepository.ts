import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { nairobiDate } from '@/lib/leads/meetingSlots';
import type { VendingOrderMeeting } from '@/types/vendingOrderMeeting';

const COLLECTION = 'vendingOrderMeetings';
/**
 * One doc per booked day, id = the Nairobi date (`yyyy-mm-dd`) — what keeps
 * it to one meeting a day. The first bookings used the start time (ms) as
 * the id; every doc carries `atMs`, so those still count for their day.
 */
const SLOTS = 'vendingOrderMeetingSlots';
const DAY_MS = 24 * 60 * 60 * 1000;

export class MeetingSlotTakenError extends Error {
  constructor() {
    super('That day was just booked. Please pick another.');
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
   * Books the meeting, atomically: claims its day (failing if someone
   * else has a meeting that day) and frees this number's previous day
   * when it is a move. Returns the previous start when it was a move,
   * else null.
   */
  async book(meeting: OrderMeetingInput): Promise<{ id: string; previousAtMs: number | null }> {
    const id = orderMeetingDocId(meeting.phone);
    const date = nairobiDate(meeting.atMs);
    const dayStart = Date.parse(`${date}T00:00:00+03:00`);
    const slots = adminFirestore.collection(SLOTS);
    const meetingRef = adminFirestore.collection(COLLECTION).doc(id);
    const dayRef = slots.doc(date);
    // Also catches a booking from before one-a-day, filed under its start time.
    const sameDay = slots.where('atMs', '>=', dayStart).where('atMs', '<', dayStart + DAY_MS);
    const previousAtMs = await adminFirestore.runTransaction(async (tx) => {
      const [meetingSnap, daySnap, sameDaySnap] = await Promise.all([tx.get(meetingRef), tx.get(dayRef), tx.get(sameDay)]);
      const heldByOther = (snap: { data(): unknown }) => (snap.data() as { meetingId: string }).meetingId !== id;
      if ((daySnap.exists && heldByOther(daySnap)) || sameDaySnap.docs.some(heldByOther)) throw new MeetingSlotTakenError();
      const previous = meetingSnap.exists ? (meetingSnap.data() as VendingOrderMeeting).atMs : null;
      if (previous !== null && previous !== meeting.atMs) {
        if (nairobiDate(previous) !== date) tx.delete(slots.doc(nairobiDate(previous)));
        tx.delete(slots.doc(String(previous)));
      }
      tx.set(dayRef, { meetingId: id, atMs: meeting.atMs, date });
      const now = FieldValue.serverTimestamp();
      tx.set(meetingRef, { ...meeting, updatedAt: now, ...(meetingSnap.exists ? {} : { createdAt: now }) }, { merge: true });
      return previous;
    });
    return { id, previousAtMs };
  }

  /** Nairobi dates that already have a meeting, from `fromMs` on. Single-field range, so no composite index. */
  async takenDates(fromMs: number): Promise<Set<string>> {
    const snapshot = await adminFirestore.collection(SLOTS).where('atMs', '>=', fromMs).get();
    return new Set(snapshot.docs.map((doc) => nairobiDate((doc.data() as { atMs: number }).atMs)));
  }

  /** Meetings starting from `fromMs` on, soonest first. */
  async listFrom(fromMs: number): Promise<{ id: string; data: VendingOrderMeeting }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('atMs', '>=', fromMs).orderBy('atMs').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as VendingOrderMeeting }));
  }
}

export const vendingOrderMeetingRepository = new VendingOrderMeetingRepository();
export { VendingOrderMeetingRepository };
