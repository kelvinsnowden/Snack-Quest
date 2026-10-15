import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type {
  VendingLead,
  VendingLeadNote,
  VendingLeadSegment,
  VendingLeadSourceFields,
  VendingLeadStatus,
} from '@/types/vendingLead';

const COLLECTION = 'vendingLeads';

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
}

export const vendingLeadRepository = new VendingLeadRepository();
export { VendingLeadRepository };
