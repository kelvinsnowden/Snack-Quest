import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { RestockTask, RestockTaskStatus } from '@/types';

const COLLECTION = 'restockTasks';

export type RestockTaskInput = Omit<RestockTask, 'createdAt' | 'updatedAt' | 'deletedAt' | 'updatedBy' | 'completedAt'> & {
  createdBy: string;
};

/** `restockTasks` reads/writes (§ CORE ENTITIES 7). */
class RestockTaskRepository {
  async create(input: RestockTaskInput): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      updatedBy: input.createdBy,
      deletedAt: null,
    });
    return ref.id;
  }

  async findById(businessId: string, taskId: string): Promise<RestockTask | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(taskId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as RestockTask;
    return data.businessId === businessId ? data : null;
  }

  async listByMachine(businessId: string, machineId: string, limit = 50): Promise<{ id: string; data: RestockTask }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as RestockTask }));
  }

  async listByStatus(businessId: string, status: RestockTaskStatus, limit = 100): Promise<{ id: string; data: RestockTask }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('status', '==', status)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as RestockTask }));
  }

  /** A machine's own open (not completed/cancelled) tasks — used to avoid opening a second identical task while one is already outstanding. */
  async listOpenByMachine(businessId: string, machineId: string): Promise<{ id: string; data: RestockTask }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .where('status', 'in', ['pending', 'assigned', 'in_progress'] satisfies RestockTaskStatus[])
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as RestockTask }));
  }

  async updateStatus(businessId: string, taskId: string, status: RestockTaskStatus, updatedBy: string): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(taskId);
    const snapshot = await ref.get();
    const data = snapshot.data() as RestockTask | undefined;
    if (!data || data.businessId !== businessId) {
      throw new Error(`Restock task ${taskId} not found`);
    }
    await ref.update({
      status,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy,
      completedAt: status === 'completed' ? FieldValue.serverTimestamp() : data.completedAt,
    });
  }

  async assign(businessId: string, taskId: string, assignedTo: string, updatedBy: string): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(taskId);
    const snapshot = await ref.get();
    const data = snapshot.data() as RestockTask | undefined;
    if (!data || data.businessId !== businessId) {
      throw new Error(`Restock task ${taskId} not found`);
    }
    await ref.update({
      assignedTo,
      status: 'assigned' satisfies RestockTaskStatus,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy,
    });
  }
}

export const restockTaskRepository = new RestockTaskRepository();
