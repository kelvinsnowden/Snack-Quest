import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type {
  VendingLead,
  VendingLeadCall,
  VendingLeadNote,
  VendingLeadNurture,
  VendingLeadSegment,
  VendingLeadSourceFields,
  VendingLeadStatus,
} from '@/types/vendingLead';

const COLLECTION = 'vendingLeads';
/** One doc per booked call slot, id = slot start ms — what stops two leads booking the same time. */
const CALLS = 'vendingLeadCalls';

export class CallSlotTakenError extends Error {
  constructor() {
    super('That time was just taken. Please pick another.');
    this.name = 'CallSlotTakenError';
  }
}

/** How many leads the admin loads at once. Newest first; plenty for a launch-stage pipeline. */
export const VENDING_LEAD_LIST_LIMIT = 500;

/** `meta_123…` / `own_abc…` — deterministic, so a re-sync lands on the same document. */
export function vendingLeadDocId(source: VendingLeadSourceFields['source'], externalId: string): string {
  const prefix = source === 'meta_sheet' ? 'meta' : 'own';
  return `${prefix}_${externalId.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 140);
}

export interface VendingLeadPatch {
  status?: VendingLeadStatus;
  segment?: VendingLeadSegment;
  nextFollowUpAtMs?: number | null;
}

class VendingLeadRepository {
  /**
   * Creates the lead, or refreshes only its source fields if it already
   * exists — status, segment, notes and follow-up are never touched by
   * a sync. Returns whether a new lead was created.
   */
  async upsertFromSource(fields: VendingLeadSourceFields, segmentGuess: VendingLeadSegment): Promise<boolean> {
    const ref = adminFirestore.collection(COLLECTION).doc(vendingLeadDocId(fields.source, fields.externalId));
    return adminFirestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const now = FieldValue.serverTimestamp();
      if (snapshot.exists) {
        tx.update(ref, { ...fields, updatedAt: now });
        return false;
      }
      tx.set(ref, {
        ...fields,
        status: 'new',
        segment: segmentGuess,
        notes: [],
        nextFollowUpAtMs: null,
        createdAt: now,
        updatedAt: now,
      });
      return true;
    });
  }

  async exists(source: VendingLeadSourceFields['source'], externalId: string): Promise<boolean> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(vendingLeadDocId(source, externalId)).get();
    return snapshot.exists;
  }

  /** Single-field order, so no composite index is needed; filtering happens in the page. */
  async listRecent(limit = VENDING_LEAD_LIST_LIMIT): Promise<{ id: string; data: VendingLead }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .orderBy('submittedAtMs', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as VendingLead }));
  }

  async findById(id: string): Promise<VendingLead | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(id).get();
    return snapshot.exists ? (snapshot.data() as VendingLead) : null;
  }

  async update(id: string, patch: VendingLeadPatch, note: VendingLeadNote | null): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(id)
      .update({
        ...patch,
        ...(note ? { notes: FieldValue.arrayUnion(note) } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
  }

  async setNurture(id: string, nurture: VendingLeadNurture): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(id).update({ nurture, updatedAt: FieldValue.serverTimestamp() });
  }

  /**
   * Reserves nurture email number `expectedSent + 1` for this lead
   * before it is sent, so the daily job and a page-triggered run can
   * never both send the same email. False when someone else got there
   * first or the sequence was stopped meanwhile.
   */
  async claimNurtureEmail(id: string, expectedSent: number, nowMs: number, isLast: boolean): Promise<boolean> {
    const ref = adminFirestore.collection(COLLECTION).doc(id);
    return adminFirestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const lead = snap.data() as VendingLead | undefined;
      if (!lead || lead.emailOptOutAtMs || lead.call) return false;
      const current = lead.nurture ?? { sent: 0, lastSentAtMs: null, stoppedReason: null };
      if (current.stoppedReason || current.sent !== expectedSent) return false;
      const next: VendingLeadNurture = {
        sent: expectedSent + 1,
        lastSentAtMs: nowMs,
        stoppedReason: isLast ? 'finished' : null,
      };
      tx.update(ref, { nurture: next, updatedAt: FieldValue.serverTimestamp() });
      return true;
    });
  }

  /** Staff stopped the emails for this lead. Keeps how many were sent. */
  async stopNurture(id: string): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(id);
    await adminFirestore.runTransaction(async (tx) => {
      const lead = (await tx.get(ref)).data() as VendingLead | undefined;
      if (!lead) return;
      const current = lead.nurture ?? { sent: 0, lastSentAtMs: null, stoppedReason: null };
      tx.update(ref, { nurture: { ...current, stoppedReason: 'staff' }, updatedAt: FieldValue.serverTimestamp() });
    });
  }

  async optOutOfEmails(id: string, atMs: number): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(id).update({
      emailOptOutAtMs: atMs,
      'nurture.stoppedReason': 'unsubscribed',
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  /**
   * Books `call` for the lead, atomically: claims the slot (failing if
   * another lead holds it), frees the lead's previous slot when this is
   * a reschedule, stops the nurture emails and records a note.
   */
  async bookCall(id: string, call: VendingLeadCall, note: VendingLeadNote, nowStatus: VendingLeadStatus | null): Promise<void> {
    const leadRef = adminFirestore.collection(COLLECTION).doc(id);
    const slotRef = adminFirestore.collection(CALLS).doc(String(call.atMs));
    await adminFirestore.runTransaction(async (tx) => {
      const [leadSnap, slotSnap] = await Promise.all([tx.get(leadRef), tx.get(slotRef)]);
      if (!leadSnap.exists) throw new Error('lead not found');
      if (slotSnap.exists && (slotSnap.data() as { leadId: string }).leadId !== id) throw new CallSlotTakenError();
      const previous = (leadSnap.data() as VendingLead).call;
      if (previous && previous.atMs !== call.atMs) {
        tx.delete(adminFirestore.collection(CALLS).doc(String(previous.atMs)));
      }
      tx.set(slotRef, { leadId: id, atMs: call.atMs });
      tx.update(leadRef, {
        call,
        nextFollowUpAtMs: call.atMs,
        ...(nowStatus ? { status: nowStatus } : {}),
        'nurture.stoppedReason': 'booked',
        notes: FieldValue.arrayUnion(note),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }

  /** Slot starts already booked from `fromMs` on. Single-field range, so no composite index. */
  async takenCallSlots(fromMs: number): Promise<Set<number>> {
    const snapshot = await adminFirestore.collection(CALLS).where('atMs', '>=', fromMs).get();
    return new Set(snapshot.docs.map((doc) => (doc.data() as { atMs: number }).atMs));
  }

  async markCallReminderSent(id: string, atMs: number): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(id).update({ 'call.reminderSentAtMs': atMs });
  }
}

export const vendingLeadRepository = new VendingLeadRepository();
export { VendingLeadRepository };
