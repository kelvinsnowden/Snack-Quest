import 'server-only';

import {
  FieldValue,
  Timestamp,
  type Transaction,
} from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { MachineOwnershipHistoryEntry } from '@/types';

const COLLECTION = 'machineOwnershipHistory';

/**
 * `machineOwnershipHistory` reads/writes. Only
 * `machineService.reassignOwner` writes here, always closing the open
 * entry and opening the next in one transaction with the machine's own
 * `ownerPartnerId`, so the two can never disagree.
 */
class MachineOwnershipHistoryRepository {
  /** The open entries for a machine. Read inside the caller's transaction so the close and the open are atomic. */
  async findOpenInTransaction(
    tx: Transaction,
    businessId: string,
    machineId: string,
  ) {
    const snapshot = await tx.get(
      adminFirestore
        .collection(COLLECTION)
        .where('businessId', '==', businessId)
        .where('machineId', '==', machineId)
        .where('effectiveTo', '==', null),
    );
    return snapshot.docs;
  }

  closeInTransaction(
    tx: Transaction,
    ref: FirebaseFirestore.DocumentReference,
  ): void {
    tx.update(ref, { effectiveTo: FieldValue.serverTimestamp() });
  }

  /**
   * Records the owner a machine had before its history began — only
   * written on a machine's first reassignment, from its registration
   * time until now, so every period after registration has exactly one
   * recorded owner.
   */
  recordOriginalInTransaction(
    tx: Transaction,
    input: {
      businessId: string;
      machineId: string;
      partnerId: string | null;
      since: Date;
      changedBy: string;
    },
  ): void {
    tx.set(adminFirestore.collection(COLLECTION).doc(), {
      businessId: input.businessId,
      machineId: input.machineId,
      partnerId: input.partnerId,
      effectiveFrom: Timestamp.fromDate(input.since),
      effectiveTo: FieldValue.serverTimestamp(),
      changedBy: input.changedBy,
      reason: 'Owner at registration',
    });
  }

  openInTransaction(
    tx: Transaction,
    input: {
      businessId: string;
      machineId: string;
      partnerId: string | null;
      changedBy: string;
      reason: string | null;
    },
  ): void {
    tx.set(adminFirestore.collection(COLLECTION).doc(), {
      ...input,
      effectiveFrom: FieldValue.serverTimestamp(),
      effectiveTo: null,
    });
  }

  /** Every owner this machine has had, oldest first. */
  async listByMachine(
    businessId: string,
    machineId: string,
  ): Promise<MachineOwnershipHistoryEntry[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .orderBy('effectiveFrom', 'asc')
      .get();
    return snapshot.docs.map(
      (doc) => doc.data() as MachineOwnershipHistoryEntry,
    );
  }
}

export const machineOwnershipHistoryRepository =
  new MachineOwnershipHistoryRepository();
