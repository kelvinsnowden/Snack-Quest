import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { ScheduledJobRun } from '@/types';

const COLLECTION = 'scheduledJobRuns';

export type ScheduledJobRunInput = Omit<ScheduledJobRun, 'startedAt'>;

class ScheduledJobRunRepository {
  /** `startedAt` is set here, not by the caller — avoids constructing a real Timestamp value across the admin/client SDK type split (see `ConversationCheckoutSnapshotRepository.create()` for the same discipline). `durationMs` (a plain number) is how the caller tracks elapsed time instead. */
  async record(input: ScheduledJobRunInput): Promise<void> {
    await adminFirestore.collection(COLLECTION).add({ ...input, startedAt: FieldValue.serverTimestamp() });
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
}

export const scheduledJobRunRepository = new ScheduledJobRunRepository();
