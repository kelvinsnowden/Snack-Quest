import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { CameraSnapshot } from '@/types';

const COLLECTION = 'cameraSnapshots';

export type CameraSnapshotInput = Omit<CameraSnapshot, 'capturedAt'>;

/** `cameraSnapshots` reads/writes (§ SNAPSHOT MODEL). Immutable, append-only, auto-id — a capture attempt is a fact, never edited after the fact. */
class CameraSnapshotRepository {
  async record(input: CameraSnapshotInput): Promise<string> {
    const ref = adminFirestore.collection(COLLECTION).doc();
    await ref.set({ ...input, capturedAt: FieldValue.serverTimestamp() });
    return ref.id;
  }

  async findById(businessId: string, snapshotId: string): Promise<CameraSnapshot | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(snapshotId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as CameraSnapshot;
    return data.businessId === businessId ? data : null;
  }

  /** Newest first — a camera's own capture history. */
  async listByCamera(businessId: string, cameraId: string, limit = 50): Promise<{ id: string; data: CameraSnapshot }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('cameraId', '==', cameraId)
      .orderBy('capturedAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as CameraSnapshot }));
  }

  /** Every snapshot captured as evidence for one transaction — § DISPENSE EVIDENCE's own read path, never written to by `machineTransactionService`. */
  async listByTransaction(businessId: string, transactionId: string): Promise<{ id: string; data: CameraSnapshot }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).where('transactionId', '==', transactionId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as CameraSnapshot }));
  }
}

export const cameraSnapshotRepository = new CameraSnapshotRepository();
