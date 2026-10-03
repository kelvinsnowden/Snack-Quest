import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { ScheduledJobRun } from '@/types';

const COLLECTION = 'scheduledJobRuns';
const LEASES = 'scheduledJobLeases';

export type ScheduledJobRunInput = Omit<ScheduledJobRun, 'startedAt'>;

class ScheduledJobRunRepository {
  /** `startedAt` is set here, not by the caller — avoids constructing a real Timestamp value across the admin/client SDK type split (see `ConversationCheckoutSnapshotRepository.create()` for the same discipline). `durationMs` (a plain number) is how the caller tracks elapsed time instead. */
  async record(input: ScheduledJobRunInput): Promise<void> {
    await adminFirestore.collection(COLLECTION).add({ ...input, startedAt: FieldValue.serverTimestamp() });
  }

  /** Writes the `running` record before any work — so a crash mid-run still leaves a trace. */
  async start(businessId: string, jobName: string): Promise<string> {
    const ref = await adminFirestore.collection(COLLECTION).add({
      businessId,
      jobName,
      status: 'running',
      startedAt: FieldValue.serverTimestamp(),
      finishedAt: null,
      durationMs: 0,
      resultSummary: null,
      error: null,
      errors: [],
    });
    return ref.id;
  }

  async finish(runId: string, outcome: Pick<ScheduledJobRun, 'status' | 'durationMs' | 'resultSummary' | 'error'> & { errors: { step: string; message: string }[] }): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(runId).update({ ...outcome, finishedAt: FieldValue.serverTimestamp() });
  }

  /**
   * Takes the job's lease if nobody holds a live one. The lease expires
   * on its own, so a run killed mid-way never blocks the next forever.
   */
  async acquireLease(businessId: string, jobName: string, holder: string, leaseMs: number, now = Date.now()): Promise<boolean> {
    const ref = adminFirestore.collection(LEASES).doc(`${businessId}__${jobName}`);
    return adminFirestore.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data() as { holder: string; until: Timestamp } | undefined;
      if (current && current.until.toMillis() > now && current.holder !== holder) {
        return false;
      }
      tx.set(ref, { businessId, jobName, holder, until: Timestamp.fromMillis(now + leaseMs), expiresAt: Timestamp.fromMillis(now + leaseMs + 24 * 60 * 60 * 1000) });
      return true;
    });
  }

  async releaseLease(businessId: string, jobName: string, holder: string): Promise<void> {
    const ref = adminFirestore.collection(LEASES).doc(`${businessId}__${jobName}`);
    await adminFirestore.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data() as { holder: string } | undefined;
      if (current?.holder === holder) {
        tx.delete(ref);
      }
    });
  }

  /** Newest first — the Operations dashboard's scheduled-job history (§ Phase 5). */
  async listRecent(businessId: string, limit = 20): Promise<{ id: string; data: ScheduledJobRun }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .orderBy('startedAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as ScheduledJobRun }));
  }

  /** One job's newest runs — for its health (last success, last failure, abandoned runs). */
  async listRecentForJob(businessId: string, jobName: string, limit = 10): Promise<{ id: string; data: ScheduledJobRun }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('jobName', '==', jobName)
      .orderBy('startedAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as ScheduledJobRun }));
  }
}

export const scheduledJobRunRepository = new ScheduledJobRunRepository();
