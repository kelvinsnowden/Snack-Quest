import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { RESTOCK_TASK_STATUS_TRANSITIONS, type RestockTask, type RestockTaskStatus } from '@/types';

const COLLECTION = 'restockTasks';

/** A task is "open" (still owed work) in any non-terminal status — the set `checkLowStock`'s dedup check and the operations queue both read. */
export const OPEN_RESTOCK_TASK_STATUSES: RestockTaskStatus[] = ['draft', 'approved', 'picking', 'dispatched', 'in_transit'];

export type RestockTaskInput = Omit<
  RestockTask,
  'createdAt' | 'updatedAt' | 'deletedAt' | 'updatedBy' | 'completedAt' | 'pickedBy' | 'pickedAt' | 'dispatchedBy' | 'dispatchedAt' | 'receivedBy'
> & {
  createdBy: string;
};

export class RestockTaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Restock task ${taskId} not found`);
    this.name = 'RestockTaskNotFoundError';
  }
}

export class IllegalRestockTaskTransitionError extends Error {
  constructor(from: RestockTaskStatus, to: RestockTaskStatus) {
    super(`Cannot move a restock task from "${from}" to "${to}"`);
    this.name = 'IllegalRestockTaskTransitionError';
  }
}

/** `restockTasks` reads/writes (§ CORE ENTITIES 7, § RESTOCKING). Every status change goes through `moveStatus`, which checks `RESTOCK_TASK_STATUS_TRANSITIONS` before writing — a caller can never skip a stage or resurrect a terminal task by supplying a status directly. */
class RestockTaskRepository {
  async create(input: RestockTaskInput): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      pickedBy: null,
      pickedAt: null,
      dispatchedBy: null,
      dispatchedAt: null,
      receivedBy: null,
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

  async getInTransaction(tx: Transaction, businessId: string, taskId: string): Promise<{ ref: FirebaseFirestore.DocumentReference; data: RestockTask } | null> {
    const ref = adminFirestore.collection(COLLECTION).doc(taskId);
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as RestockTask;
    return data.businessId === businessId ? { ref, data } : null;
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

  /** A machine's own open (non-terminal) tasks — used to avoid opening a second identical task while one is already outstanding, and as the operations queue's own read. */
  async listOpenByMachine(businessId: string, machineId: string): Promise<{ id: string; data: RestockTask }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .where('status', 'in', OPEN_RESTOCK_TASK_STATUSES)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as RestockTask }));
  }

  /**
   * The one status-changing write every transition goes through
   * (approve/cancel; picking/dispatch/in-transit/receive layer
   * additional field writes on top via the `extraFields` param, but
   * still call this for the guard + the write itself, never bypass
   * it). Reads the current status and checks
   * `RESTOCK_TASK_STATUS_TRANSITIONS` before writing, inside the
   * caller's transaction — the same crash-safe "read-check-write, all
   * inside one transaction" discipline `WithdrawalService` already
   * uses for its own state machine, so two concurrent actions on one
   * task can never both succeed.
   */
  moveStatusInTransaction(
    tx: Transaction,
    ref: FirebaseFirestore.DocumentReference,
    from: RestockTaskStatus,
    to: RestockTaskStatus,
    updatedBy: string,
    extraFields: Record<string, unknown> = {},
  ): void {
    const allowed = RESTOCK_TASK_STATUS_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new IllegalRestockTaskTransitionError(from, to);
    }
    const isTerminal = RESTOCK_TASK_STATUS_TRANSITIONS[to].length === 0;
    tx.update(ref, {
      status: to,
      ...extraFields,
      ...(isTerminal ? { completedAt: FieldValue.serverTimestamp() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy,
    });
  }

  async moveStatus(businessId: string, taskId: string, to: RestockTaskStatus, updatedBy: string, extraFields: Record<string, unknown> = {}): Promise<void> {
    await adminFirestore.runTransaction(async (tx) => {
      const found = await this.getInTransaction(tx, businessId, taskId);
      if (!found) {
        throw new RestockTaskNotFoundError(taskId);
      }
      this.moveStatusInTransaction(tx, found.ref, found.data.status, to, updatedBy, extraFields);
    });
  }
}

export const restockTaskRepository = new RestockTaskRepository();
