import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { Alert, AlertSeverity, AlertStatus, AlertType } from '@/types';

const COLLECTION = 'alerts';
const OPEN_STATUSES: AlertStatus[] = ['open', 'acknowledged'];

export class AlertNotFoundError extends Error {
  constructor(alertId: string) {
    super(`Alert ${alertId} not found`);
    this.name = 'AlertNotFoundError';
  }
}

export class AlertNotOpenError extends Error {
  constructor(alertId: string, status: AlertStatus) {
    super(`Alert ${alertId} is "${status}", not open or acknowledged`);
    this.name = 'AlertNotOpenError';
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 6;
}

export type AlertConditionInput = Omit<Alert, 'createdAt' | 'updatedAt' | 'status' | 'assignee' | 'resolution' | 'resolvedAt' | 'resolvedBy'>;

/**
 * `alerts` reads/writes (§ PART 6 — ALERT CENTER). See `types/alert.ts`
 * for the condition-alert vs event-alert distinction every method
 * below is built around.
 */
class AlertRepository {
  /**
   * Opens a condition alert if none is already open for this exact
   * `dedupeKey`, inside a transaction so two concurrent sweeps can
   * never both create one (the same `tx.get(query)` + write primitive
   * `machineSettlementRepository.createIfNoOverlap` uses). A no-op
   * when one is already open — `evaluateAndSync` calls this on every
   * sweep for every currently-true condition, so this has to be safe
   * to call repeatedly for the same still-true condition.
   */
  async upsertOpenCondition(input: AlertConditionInput): Promise<string> {
    return adminFirestore.runTransaction(async (tx) => {
      const query = adminFirestore
        .collection(COLLECTION)
        .where('businessId', '==', input.businessId)
        .where('dedupeKey', '==', input.dedupeKey)
        .where('status', 'in', OPEN_STATUSES)
        .limit(1);
      const snapshot = await tx.get(query);
      if (!snapshot.empty) {
        return snapshot.docs[0].id;
      }
      const ref = adminFirestore.collection(COLLECTION).doc();
      const now = FieldValue.serverTimestamp();
      tx.set(ref, {
        ...input,
        status: 'open' satisfies AlertStatus,
        assignee: null,
        resolution: null,
        resolvedAt: null,
        resolvedBy: null,
        createdAt: now,
        updatedAt: now,
      });
      return ref.id;
    });
  }

  /**
   * Opens an event alert exactly once, ever, for a given `dedupeKey` —
   * the same doc-id-as-idempotency-key primitive
   * `machineTelemetryEventRepository.recordIfNew` uses. Unlike
   * `upsertOpenCondition`, this checks for *any* existing document
   * with this id regardless of status: a fault/discrepancy event that
   * was already resolved must never be recreated just because the
   * sweep saw the same source event again inside its lookback window.
   */
  async recordEventOnce(input: AlertConditionInput, dedupeDocId: string): Promise<{ isNew: boolean; id: string }> {
    const ref = adminFirestore.collection(COLLECTION).doc(dedupeDocId);
    const now = FieldValue.serverTimestamp();
    try {
      await ref.create({
        ...input,
        status: 'open' satisfies AlertStatus,
        assignee: null,
        resolution: null,
        resolvedAt: null,
        resolvedBy: null,
        createdAt: now,
        updatedAt: now,
      });
      return { isNew: true, id: ref.id };
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        return { isNew: false, id: ref.id };
      }
      throw error;
    }
  }

  /**
   * Resolves every open/acknowledged condition alert of `type` whose
   * `dedupeKey` is not in `stillTrueDedupeKeys` — the other half of
   * the sweep (§ this file's own doc comment on condition alerts:
   * "the sweep auto-resolves any open alert whose condition it no
   * longer finds true"). Never touches event alerts — callers only
   * pass a condition `type`.
   */
  async autoResolveMissing(businessId: string, type: AlertType, stillTrueDedupeKeys: ReadonlySet<string>): Promise<void> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('type', '==', type)
      .where('status', 'in', OPEN_STATUSES)
      .get();
    const batch = adminFirestore.batch();
    let any = false;
    for (const doc of snapshot.docs) {
      const data = doc.data() as Alert;
      if (!stillTrueDedupeKeys.has(data.dedupeKey)) {
        any = true;
        batch.update(doc.ref, {
          status: 'resolved' satisfies AlertStatus,
          resolution: 'Auto-resolved: the underlying condition cleared.',
          resolvedBy: 'system',
          resolvedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
    if (any) {
      await batch.commit();
    }
  }

  async findById(businessId: string, alertId: string): Promise<Alert | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(alertId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as Alert;
    return data.businessId === businessId ? data : null;
  }

  /**
   * Every open/acknowledged alert, newest first. `type`/`severity`/
   * `machineId` are filtered in memory, not folded into the Firestore
   * query — the query itself only ever needs the one composite index
   * (`businessId`, `status`, `createdAt`), and this set is bounded by
   * how many issues can realistically be open across a fleet at once,
   * not by transaction volume (the same accepted scale
   * `machineRepository.listAllStatuses` documents), so filtering the
   * fetched page rather than adding a combinatorial index per filter
   * combination costs nothing real. Revisit with pagination if that
   * stops holding.
   */
  async listOpen(
    businessId: string,
    filters: { type?: AlertType; severity?: AlertSeverity; machineId?: string } = {},
  ): Promise<{ id: string; data: Alert }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('status', 'in', OPEN_STATUSES)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as Alert }))
      .filter(({ data }) => (!filters.type || data.type === filters.type) && (!filters.severity || data.severity === filters.severity) && (!filters.machineId || data.machineId === filters.machineId));
  }

  async acknowledge(businessId: string, alertId: string, actor: string): Promise<Alert> {
    const ref = adminFirestore.collection(COLLECTION).doc(alertId);
    const snapshot = await ref.get();
    const data = snapshot.data() as Alert | undefined;
    if (!data || data.businessId !== businessId) {
      throw new AlertNotFoundError(alertId);
    }
    if (!OPEN_STATUSES.includes(data.status)) {
      throw new AlertNotOpenError(alertId, data.status);
    }
    await ref.update({ status: 'acknowledged' satisfies AlertStatus, assignee: actor, updatedAt: FieldValue.serverTimestamp() });
    const updated = await ref.get();
    return updated.data() as Alert;
  }

  async resolve(businessId: string, alertId: string, actor: string, resolution: string): Promise<Alert> {
    const ref = adminFirestore.collection(COLLECTION).doc(alertId);
    const snapshot = await ref.get();
    const data = snapshot.data() as Alert | undefined;
    if (!data || data.businessId !== businessId) {
      throw new AlertNotFoundError(alertId);
    }
    if (!OPEN_STATUSES.includes(data.status)) {
      throw new AlertNotOpenError(alertId, data.status);
    }
    const now = FieldValue.serverTimestamp();
    await ref.update({ status: 'resolved' satisfies AlertStatus, resolution, resolvedBy: actor, resolvedAt: now, updatedAt: now });
    const updated = await ref.get();
    return updated.data() as Alert;
  }
}

export const alertRepository = new AlertRepository();
