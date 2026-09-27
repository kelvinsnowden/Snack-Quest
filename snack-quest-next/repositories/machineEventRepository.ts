import 'server-only';

import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { MachineEvent, MachineEventType } from '@/types';

const COLLECTION = 'machineEvents';

function docId(businessId: string, machineId: string, dedupeKey: string): string {
  // Hashed so an arbitrary manufacturer event id (slashes, huge lengths) can never produce an invalid document id.
  return createHash('sha256').update(`${businessId}\u0000${machineId}\u0000${dedupeKey}`).digest('hex');
}

function isAlreadyExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 6;
}

export type MachineEventInput = Omit<MachineEvent, 'occurredAt' | 'receivedAt'> & { occurredAt: Date; receivedAt: Date };

/** `machineEvents` reads/writes — append-only, deduplicated per machine by `dedupeKey` with the same `create()` primitive every other idempotency ledger here uses. */
class MachineEventRepository {
  async recordIfNew(input: MachineEventInput): Promise<{ isNew: boolean; id: string }> {
    const id = docId(input.businessId, input.machineId, input.dedupeKey);
    try {
      await adminFirestore
        .collection(COLLECTION)
        .doc(id)
        .create({ ...input, occurredAt: Timestamp.fromDate(input.occurredAt), receivedAt: Timestamp.fromDate(input.receivedAt) });
      return { isNew: true, id };
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        return { isNew: false, id };
      }
      throw error;
    }
  }

  async listByMachine(businessId: string, machineId: string, limit = 50): Promise<{ id: string; data: MachineEvent }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .orderBy('occurredAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as MachineEvent }));
  }

  /** Every event received in a window, paged — the primitive behind reliability analytics and the alert sweep. */
  async *streamReceived(businessId: string, options: { since: Date; until?: Date; types?: readonly MachineEventType[] }): AsyncGenerator<{ id: string; data: MachineEvent }> {
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('receivedAt', '>=', options.since) as FirebaseFirestore.Query;
    if (options.until) {
      query = query.where('receivedAt', '<', options.until);
    }
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      let page = query.orderBy('receivedAt').limit(500);
      if (cursor) {
        page = page.startAfter(cursor);
      }
      const snapshot = await page.get();
      for (const doc of snapshot.docs) {
        const data = doc.data() as MachineEvent;
        if (!options.types || options.types.includes(data.type)) {
          yield { id: doc.id, data };
        }
      }
      if (snapshot.docs.length < 500) {
        return;
      }
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }
  }
}

export const machineEventRepository = new MachineEventRepository();
