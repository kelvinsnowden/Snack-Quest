import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { MachineTelemetryEvent, MachineTelemetryEventType } from '@/types';

const COLLECTION = 'machineTelemetryEvents';

function docId(businessId: string, machineId: string, idempotencyKey: string): string {
  return `${businessId}:${machineId}:${idempotencyKey}`;
}

function isAlreadyExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 6;
}

export type MachineTelemetryEventInput = Omit<MachineTelemetryEvent, 'receivedAt' | 'processed' | 'processingError'>;

/**
 * `machineTelemetryEvents` reads/writes (§ CORE ENTITIES 5,
 * § idempotency). `recordIfNew` is the exact same atomicity primitive
 * `webhookEventRepository.recordIfNew` already uses — Firestore's
 * `create()` fails if the document already exists, so two identical
 * device reports (a genuine retry after a dropped acknowledgement,
 * per § offline behaviour) can never both succeed. The doc id is
 * `businessId:machineId:idempotencyKey`, so a key only has to be
 * unique per machine, not fleet-wide.
 */
class MachineTelemetryEventRepository {
  async recordIfNew(input: MachineTelemetryEventInput): Promise<{ isNew: boolean; id: string }> {
    const id = docId(input.businessId, input.machineId, input.idempotencyKey);
    const ref = adminFirestore.collection(COLLECTION).doc(id);
    try {
      await ref.create({ ...input, receivedAt: FieldValue.serverTimestamp(), processed: false, processingError: null });
      return { isNew: true, id };
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        return { isNew: false, id };
      }
      throw error;
    }
  }

  async findById(businessId: string, id: string): Promise<MachineTelemetryEvent | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as MachineTelemetryEvent;
    return data.businessId === businessId ? data : null;
  }

  async markProcessed(id: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(id).update({ processed: true, processingError: null });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(id).update({ processed: false, processingError: error });
  }

  /** Every event in a window, cursor-paged — the rollup primitive for fault/heartbeat counts, same shape as `machineTransactionRepository.streamRange`. */
  async *streamRange(
    businessId: string,
    options: { since?: Date; until?: Date; machineId?: string; eventType?: MachineTelemetryEventType; pageSize?: number } = {},
  ): AsyncGenerator<{ id: string; data: MachineTelemetryEvent }> {
    const pageSize = options.pageSize ?? 500;
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      let query = adminFirestore
        .collection(COLLECTION)
        .where('businessId', '==', businessId) as FirebaseFirestore.Query;
      if (options.machineId) {
        query = query.where('machineId', '==', options.machineId);
      }
      if (options.eventType) {
        query = query.where('eventType', '==', options.eventType);
      }
      if (options.since) {
        query = query.where('receivedAt', '>=', options.since);
      }
      if (options.until) {
        query = query.where('receivedAt', '<', options.until);
      }
      query = query.orderBy('receivedAt', 'desc').limit(pageSize);
      if (cursor) {
        query = query.startAfter(cursor);
      }
      const snapshot = await query.get();
      if (snapshot.empty) {
        return;
      }
      for (const doc of snapshot.docs) {
        yield { id: doc.id, data: doc.data() as MachineTelemetryEvent };
      }
      if (snapshot.size < pageSize) {
        return;
      }
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }
  }

  /** Newest first, optionally narrowed to one event type — the per-machine telemetry feed. */
  async listByMachine(
    businessId: string,
    machineId: string,
    options: { eventType?: MachineTelemetryEventType; limit?: number } = {},
  ): Promise<{ id: string; data: MachineTelemetryEvent }[]> {
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId) as FirebaseFirestore.Query;
    if (options.eventType) {
      query = query.where('eventType', '==', options.eventType);
    }
    query = query.orderBy('receivedAt', 'desc').limit(options.limit ?? 100);
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as MachineTelemetryEvent }));
  }
}

export const machineTelemetryEventRepository = new MachineTelemetryEventRepository();
