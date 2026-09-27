import 'server-only';

import { randomBytes } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import {
  DISPENSE_COMMAND_STATUS_TRANSITIONS,
  dispenseCommandDocId,
  type DispenseCommandStatus,
  type MachineDispenseCommand,
} from '@/types';

const COLLECTION = 'machineDispenseCommands';

export class DispenseCommandNotFoundError extends Error {
  constructor(reference: string) {
    super(`Dispense command ${reference} not found`);
    this.name = 'DispenseCommandNotFoundError';
  }
}

export class IllegalDispenseCommandTransitionError extends Error {
  constructor(readonly from: DispenseCommandStatus, readonly to: DispenseCommandStatus) {
    super(`Cannot move a dispense command from "${from}" to "${to}"`);
    this.name = 'IllegalDispenseCommandTransitionError';
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 6;
}

export type DispenseCommandClaim = Omit<
  MachineDispenseCommand,
  'commandRef' | 'idempotencyKey' | 'status' | 'statusHistory' | 'delivery' | 'vendRef' | 'failureReason' | 'failureCode' | 'dispenseResultStatus' | 'expiresAt' | 'createdAt' | 'updatedAt'
> & { expiresAt: Date };

export type DispenseCommandFields = Partial<Pick<MachineDispenseCommand, 'delivery' | 'vendRef' | 'failureReason' | 'failureCode' | 'dispenseResultStatus'>>;

/**
 * `machineDispenseCommands` reads/writes. `claim` is the idempotency
 * primitive (Firestore `create()` fails if the id exists), and
 * `moveStatus` runs in a transaction so two concurrent reports about
 * the same command can never both apply a transition from the same
 * starting state.
 */
class MachineDispenseCommandRepository {
  async claim(input: DispenseCommandClaim): Promise<{ claimed: true; command: MachineDispenseCommand } | { claimed: false; command: MachineDispenseCommand }> {
    const ref = adminFirestore.collection(COLLECTION).doc(dispenseCommandDocId(input.transactionId));
    const now = Timestamp.now();
    const command = {
      ...input,
      commandRef: `DSP-${randomBytes(4).toString('hex').toUpperCase()}`,
      idempotencyKey: `${input.transactionId}:${input.machineId}`,
      status: 'requested' as const,
      statusHistory: [{ status: 'requested' as const, at: now, detail: null }],
      delivery: null,
      vendRef: null,
      failureReason: null,
      failureCode: null,
      dispenseResultStatus: null,
      expiresAt: Timestamp.fromDate(input.expiresAt),
      createdAt: now,
      updatedAt: now,
    };
    try {
      await ref.create(command);
      return { claimed: true, command: command as unknown as MachineDispenseCommand };
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
      const existing = await ref.get();
      return { claimed: false, command: existing.data() as MachineDispenseCommand };
    }
  }

  async findByTransactionId(businessId: string, transactionId: string): Promise<MachineDispenseCommand | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(dispenseCommandDocId(transactionId)).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as MachineDispenseCommand;
    return data.businessId === businessId ? data : null;
  }

  async findByCommandRef(businessId: string, commandRef: string): Promise<MachineDispenseCommand | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('commandRef', '==', commandRef)
      .limit(1)
      .get();
    return snapshot.empty ? null : (snapshot.docs[0].data() as MachineDispenseCommand);
  }

  /** For adapters: a command by its public reference, scoped by the (globally unique) machine id rather than a tenant. */
  async findForMachine(machineId: string, commandRef: string): Promise<MachineDispenseCommand | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('machineId', '==', machineId)
      .where('commandRef', '==', commandRef)
      .limit(1)
      .get();
    return snapshot.empty ? null : (snapshot.docs[0].data() as MachineDispenseCommand);
  }

  /**
   * Applies one transition atomically. `allowNoop` lets a caller treat
   * "already in that state" as success — a device re-sending the same
   * acknowledgement is routine, not an error.
   */
  async moveStatus(
    businessId: string,
    transactionId: string,
    to: DispenseCommandStatus,
    fields: DispenseCommandFields = {},
    detail: string | null = null,
    options: { allowNoop?: boolean } = {},
  ): Promise<{ changed: boolean; command: MachineDispenseCommand }> {
    const ref = adminFirestore.collection(COLLECTION).doc(dispenseCommandDocId(transactionId));
    return adminFirestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const data = snapshot.data() as MachineDispenseCommand | undefined;
      if (!data || data.businessId !== businessId) {
        throw new DispenseCommandNotFoundError(transactionId);
      }
      if (data.status === to && options.allowNoop) {
        return { changed: false, command: data };
      }
      if (!DISPENSE_COMMAND_STATUS_TRANSITIONS[data.status].includes(to)) {
        throw new IllegalDispenseCommandTransitionError(data.status, to);
      }
      const now = Timestamp.now();
      const update = {
        ...fields,
        status: to,
        statusHistory: FieldValue.arrayUnion({ status: to, at: now, detail }),
        updatedAt: now,
      };
      tx.update(ref, update);
      return {
        changed: true,
        command: { ...data, ...fields, status: to, statusHistory: [...data.statusHistory, { status: to, at: now, detail }], updatedAt: now } as MachineDispenseCommand,
      };
    });
  }

  /** Commands a queued (inbound) machine should collect: sent to it, not yet acknowledged, not expired. */
  async listQueuedForMachine(businessId: string, machineId: string): Promise<MachineDispenseCommand[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .where('status', '==', 'sent')
      .get();
    const now = Date.now();
    return snapshot.docs
      .map((doc) => doc.data() as MachineDispenseCommand)
      .filter((command) => command.delivery === 'queued' && command.expiresAt.toMillis() > now)
      .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
  }

  /** One machine's commands in any of these statuses — small sets (a machine has at most a handful in flight). */
  async listForMachineInStatuses(businessId: string, machineId: string, statuses: DispenseCommandStatus[], limit = 20): Promise<MachineDispenseCommand[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .where('status', 'in', statuses)
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => doc.data() as MachineDispenseCommand);
  }

  async scheduleReconcile(businessId: string, transactionId: string, attempts: number, nextAt: Date | null): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(dispenseCommandDocId(transactionId));
    await ref.update({ reconcileAttempts: attempts, nextReconcileAt: nextAt ? Timestamp.fromDate(nextAt) : null });
  }

  async listByStatusUpdatedBefore(businessId: string, status: DispenseCommandStatus, before: Date, limit = 200): Promise<MachineDispenseCommand[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('status', '==', status)
      .where('updatedAt', '<', before)
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => doc.data() as MachineDispenseCommand);
  }

  async listByMachine(businessId: string, machineId: string, limit = 50): Promise<MachineDispenseCommand[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => doc.data() as MachineDispenseCommand);
  }

  async *streamRange(businessId: string, options: { since: Date; until?: Date }): AsyncGenerator<MachineDispenseCommand> {
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('createdAt', '>=', options.since) as FirebaseFirestore.Query;
    if (options.until) {
      query = query.where('createdAt', '<', options.until);
    }
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      let page = query.orderBy('createdAt').limit(500);
      if (cursor) {
        page = page.startAfter(cursor);
      }
      const snapshot = await page.get();
      for (const doc of snapshot.docs) {
        yield doc.data() as MachineDispenseCommand;
      }
      if (snapshot.docs.length < 500) {
        return;
      }
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }
  }
}

export const machineDispenseCommandRepository = new MachineDispenseCommandRepository();
