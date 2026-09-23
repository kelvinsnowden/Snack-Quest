import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { Machine, MachineStatus } from '@/types';

const COLLECTION = 'machines';

export type MachineInput = Omit<Machine, 'createdAt' | 'updatedAt' | 'deletedAt' | 'updatedBy'> & {
  createdBy: string;
};

export class MachineNotFoundError extends Error {
  constructor(machineId: string) {
    super(`Machine ${machineId} not found`);
    this.name = 'MachineNotFoundError';
  }
}

/**
 * `machines` reads/writes (§ CORE ENTITIES 1). Persistence only —
 * `machineService` owns the status state machine, partner scoping and
 * location-history bookkeeping; this repository just stores what it
 * decides.
 */
class MachineRepository {
  async create(input: MachineInput): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      createdAt: now,
      updatedAt: now,
      updatedBy: input.createdBy,
      deletedAt: null,
    });
    return ref.id;
  }

  async findById(businessId: string, machineId: string): Promise<Machine | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(machineId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as Machine;
    return data.businessId === businessId ? data : null;
  }

  async findByMachineCode(businessId: string, machineCode: string): Promise<{ id: string; data: Machine } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineCode', '==', machineCode)
      .limit(1)
      .get();
    return snapshot.empty ? null : { id: snapshot.docs[0].id, data: snapshot.docs[0].data() as Machine };
  }

  /** Every machine Snack Quest itself operates — no partner filter, for the internal fleet dashboard. */
  async listByBusiness(
    businessId: string,
    options: { status?: MachineStatus; limit?: number; cursor?: string } = {},
  ): Promise<{ machines: { id: string; data: Machine }[]; nextCursor: string | null }> {
    const pageSize = options.limit ?? 50;
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId) as FirebaseFirestore.Query;
    if (options.status) {
      query = query.where('status', '==', options.status);
    }
    query = query.orderBy('createdAt', 'desc').limit(pageSize + 1);
    if (options.cursor) {
      const cursorDoc = await adminFirestore.collection(COLLECTION).doc(options.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }
    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, pageSize);
    return {
      machines: docs.map((doc) => ({ id: doc.id, data: doc.data() as Machine })),
      nextCursor: snapshot.docs.length > pageSize ? docs[docs.length - 1].id : null,
    };
  }

  /**
   * Every machine a given partner owns — the enforcement primitive
   * behind "a partner must only access machines they own"
   * (§ RBAC). Every partner-facing read goes through this, or through
   * `assertPartnerOwnsMachine`, never through `findById` alone.
   */
  async listByPartner(businessId: string, partnerId: string): Promise<{ id: string; data: Machine }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('ownerPartnerId', '==', partnerId)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Machine }));
  }

  async countByStatus(businessId: string, status: MachineStatus): Promise<number> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('status', '==', status)
      .count()
      .get();
    return snapshot.data().count;
  }

  /** Every machine, unpaginated — for the fleet-wide status summary card, which needs a full count breakdown rather than a page. Bounded by fleet size, not by an arbitrary constant; revisit per `docs/FLEET_ARCHITECTURE_AUDIT.md`'s own escalation path once that stops being true. */
  async listAllStatuses(businessId: string): Promise<{ id: string; status: MachineStatus; lastSeenAt: Machine['lastSeenAt'] }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).get();
    return snapshot.docs.map((doc) => {
      const data = doc.data() as Machine;
      return { id: doc.id, status: data.status, lastSeenAt: data.lastSeenAt };
    });
  }

  async updateStatus(businessId: string, machineId: string, status: MachineStatus, updatedBy: string): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(machineId);
    const snapshot = await ref.get();
    const data = snapshot.data() as Machine | undefined;
    if (!data || data.businessId !== businessId) {
      throw new MachineNotFoundError(machineId);
    }
    await ref.update({ status, updatedAt: FieldValue.serverTimestamp(), updatedBy });
  }

  async updateLastSeen(machineId: string, deviceTimestamp: Date | null): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(machineId).update({
      lastSeenAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    void deviceTimestamp; // Kept as a parameter for callers that may want it later; never trusted over the server's own receipt time for "is this machine alive right now".
  }

  /** Updates location fields on the machine document itself — called alongside `machineLocationHistoryRepository`'s own open/close inside the same transaction by `machineService.relocate()`, never on its own. */
  updateLocationInTransaction(
    tx: Transaction,
    machineId: string,
    location: {
      locationId: string | null;
      latitude: number | null;
      longitude: number | null;
      address: string | null;
      venueName: string | null;
    },
    updatedBy: string,
  ): void {
    tx.update(adminFirestore.collection(COLLECTION).doc(machineId), {
      ...location,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy,
    });
  }

  getRef(machineId: string): FirebaseFirestore.DocumentReference {
    return adminFirestore.collection(COLLECTION).doc(machineId);
  }
}

export const machineRepository = new MachineRepository();
