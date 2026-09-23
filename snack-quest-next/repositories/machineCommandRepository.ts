import 'server-only';

import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { MACHINE_COMMAND_STATUS_TRANSITIONS, type MachineCommand, type MachineCommandStatus, type MachineCommandType } from '@/types';

const COLLECTION = 'machineCommands';

export class MachineCommandNotFoundError extends Error {
  constructor(commandId: string) {
    super(`Machine command ${commandId} not found`);
    this.name = 'MachineCommandNotFoundError';
  }
}

export class IllegalCommandTransitionError extends Error {
  constructor(from: MachineCommandStatus, to: MachineCommandStatus) {
    super(`Cannot move a machine command from "${from}" to "${to}"`);
    this.name = 'IllegalCommandTransitionError';
  }
}

/**
 * `machineCommands` reads/writes — the remote command center's own
 * persistence (§ types/machineCommand.ts). Same discipline as
 * `machineTransactionRepository`: `moveStatus` is the one path that
 * changes `status`, and it never trusts a caller's target without
 * checking `MACHINE_COMMAND_STATUS_TRANSITIONS` first.
 */
class MachineCommandRepository {
  async create(input: {
    businessId: string;
    machineId: string;
    commandType: MachineCommandType;
    payload: Record<string, unknown> | null;
    requestedBy: string;
    expiresAt: Date;
  }): Promise<{ id: string; commandRef: string }> {
    const now = FieldValue.serverTimestamp();
    const commandRef = `CMD-${randomUUID().slice(0, 8).toUpperCase()}`;
    const ref = await adminFirestore.collection(COLLECTION).add({
      businessId: input.businessId,
      machineId: input.machineId,
      commandRef,
      commandType: input.commandType,
      payload: input.payload,
      requestedBy: input.requestedBy,
      expiresAt: input.expiresAt,
      status: 'pending' satisfies MachineCommandStatus,
      acknowledgedAt: null,
      completedAt: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    });
    return { id: ref.id, commandRef };
  }

  async findById(businessId: string, commandId: string): Promise<MachineCommand | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(commandId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as MachineCommand;
    return data.businessId === businessId ? data : null;
  }

  /**
   * A machine's own pending commands, oldest first — the poll route's
   * read. Filtering by `expiresAt` here would need an inequality on a
   * second field alongside the `createdAt` orderBy, which Firestore
   * does not allow in one query; expiry is checked instead at
   * acknowledgement time (`MachineCommandService.acknowledge`), not
   * filtered out of this list.
   */
  async listPendingByMachine(businessId: string, machineId: string): Promise<{ id: string; data: MachineCommand }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .where('status', '==', 'pending' satisfies MachineCommandStatus)
      .orderBy('createdAt', 'asc')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as MachineCommand }));
  }

  /** One machine's full command history, newest first — the admin detail page's own read. */
  async listByMachine(
    businessId: string,
    machineId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ commands: { id: string; data: MachineCommand }[]; nextCursor: string | null }> {
    const pageSize = options.limit ?? 20;
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .orderBy('createdAt', 'desc')
      .limit(pageSize + 1) as FirebaseFirestore.Query;
    if (options.cursor) {
      const cursorDoc = await adminFirestore.collection(COLLECTION).doc(options.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }
    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, pageSize);
    return {
      commands: docs.map((doc) => ({ id: doc.id, data: doc.data() as MachineCommand })),
      nextCursor: snapshot.docs.length > pageSize ? docs[docs.length - 1].id : null,
    };
  }

  /** Fleet-wide, one status at a time — the reconciliation sweep's own read, same shape as `machineTransactionRepository.listByStatusUpdatedBefore`. */
  async listByStatusUpdatedBefore(businessId: string, status: MachineCommandStatus, before: Date, limit = 200): Promise<{ id: string; data: MachineCommand }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('status', '==', status)
      .where('updatedAt', '<', before)
      .orderBy('updatedAt', 'asc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as MachineCommand }));
  }

  async moveStatus(
    businessId: string,
    commandId: string,
    to: MachineCommandStatus,
    fields: Partial<Pick<MachineCommand, 'error'>> = {},
  ): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(commandId);
    const snapshot = await ref.get();
    const data = snapshot.data() as MachineCommand | undefined;
    if (!data || data.businessId !== businessId) {
      throw new MachineCommandNotFoundError(commandId);
    }
    const allowed = MACHINE_COMMAND_STATUS_TRANSITIONS[data.status] ?? [];
    if (!allowed.includes(to)) {
      throw new IllegalCommandTransitionError(data.status, to);
    }
    const now = FieldValue.serverTimestamp();
    await ref.update({
      ...fields,
      status: to,
      updatedAt: now,
      ...(to === 'acknowledged' ? { acknowledgedAt: now } : {}),
      ...(to === 'completed' || to === 'failed' ? { completedAt: now } : {}),
    });
  }
}

export const machineCommandRepository = new MachineCommandRepository();
