import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { MAINTENANCE_REQUEST_TRANSITIONS, type MaintenanceCost, type MaintenanceRequest, type MaintenanceRequestStatus } from '@/types/maintenance';

const REQUESTS = 'maintenanceRequests';
const COSTS = 'maintenanceCosts';
/** A request keeps at most this many status updates; the oldest beyond it are dropped, the first (raised) always kept. */
const MAX_UPDATES = 50;

/** The types use the client SDK's `Timestamp`; the admin SDK's is the same value on the wire. */
type StoredTimestamp = MaintenanceRequest['createdAt'];
const nowStamp = (): StoredTimestamp => Timestamp.now() as unknown as StoredTimestamp;

export class MaintenanceNotFoundError extends Error {
  constructor(what: 'Request' | 'Cost', id: string) {
    super(`Maintenance ${what.toLowerCase()} ${id} not found`);
    this.name = 'MaintenanceNotFoundError';
  }
}

export class MaintenanceStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MaintenanceStateError';
  }
}

type Row<T> = { id: string; data: T };

/**
 * `maintenanceRequests` and `maintenanceCosts`. Every read checks
 * `businessId`; another tenant's document reads as not found. Status
 * changes and voids run in a transaction, so two people acting on the
 * same request at once cannot both win.
 */
class MaintenanceRepository {
  async createRequest(input: Omit<MaintenanceRequest, 'createdAt' | 'updatedAt' | 'closedAt' | 'updates' | 'status' | 'scheduledFor' | 'resolution'>, note: string | null): Promise<string> {
    const now = nowStamp();
    const ref = adminFirestore.collection(REQUESTS).doc();
    const request: MaintenanceRequest = {
      ...input,
      status: 'open',
      scheduledFor: null,
      resolution: null,
      updates: [{ at: now, by: input.raisedBy.uid, byKind: input.raisedBy.kind, status: 'open', note }],
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    };
    await ref.set(request);
    return ref.id;
  }

  async findRequest(businessId: string, id: string): Promise<MaintenanceRequest | null> {
    const snapshot = await adminFirestore.collection(REQUESTS).doc(id).get();
    const data = snapshot.data() as MaintenanceRequest | undefined;
    return data && data.businessId === businessId ? data : null;
  }

  /**
   * Moves a request on. `expectPartnerId` (an owner acting) refuses a
   * request that isn't theirs as not found. Only the allowed transitions
   * pass; a final request cannot change again.
   */
  async transitionRequest(
    businessId: string,
    id: string,
    change: { to: MaintenanceRequestStatus; by: string; byKind: 'owner' | 'staff'; note: string | null; scheduledFor?: string | null; resolution?: string | null; expectPartnerId?: string },
  ): Promise<MaintenanceRequest> {
    const ref = adminFirestore.collection(REQUESTS).doc(id);
    return adminFirestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const current = snapshot.data() as MaintenanceRequest | undefined;
      if (!current || current.businessId !== businessId || (change.expectPartnerId !== undefined && current.partnerId !== change.expectPartnerId)) {
        throw new MaintenanceNotFoundError('Request', id);
      }
      const sameStatus = change.to === current.status;
      if (!sameStatus && !MAINTENANCE_REQUEST_TRANSITIONS[current.status].includes(change.to)) {
        throw new MaintenanceStateError(`A ${current.status} request cannot become ${change.to}`);
      }
      if (sameStatus && (current.status === 'resolved' || current.status === 'cancelled')) {
        throw new MaintenanceStateError(`This request is already ${current.status}`);
      }
      const now = nowStamp();
      const updates = [...current.updates, { at: now, by: change.by, byKind: change.byKind, status: change.to, note: change.note }];
      const trimmed = updates.length > MAX_UPDATES ? [updates[0], ...updates.slice(updates.length - MAX_UPDATES + 1)] : updates;
      const closing = change.to === 'resolved' || change.to === 'cancelled';
      const next: MaintenanceRequest = {
        ...current,
        status: change.to,
        scheduledFor: change.scheduledFor !== undefined ? change.scheduledFor : current.scheduledFor,
        resolution: change.resolution !== undefined ? change.resolution : current.resolution,
        updates: trimmed,
        updatedAt: now,
        closedAt: closing ? now : current.closedAt,
      };
      tx.set(ref, next);
      return next;
    });
  }

  async listRequests(businessId: string, filters: { status?: MaintenanceRequestStatus; machineId?: string; partnerId?: string; limit?: number } = {}): Promise<Row<MaintenanceRequest>[]> {
    let query: FirebaseFirestore.Query = adminFirestore.collection(REQUESTS).where('businessId', '==', businessId);
    if (filters.status) query = query.where('status', '==', filters.status);
    if (filters.machineId) query = query.where('machineId', '==', filters.machineId);
    if (filters.partnerId) query = query.where('partnerId', '==', filters.partnerId);
    const snapshot = await query.orderBy('createdAt', 'desc').limit(filters.limit ?? 200).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as MaintenanceRequest }));
  }

  async countOpenRequests(businessId: string): Promise<number> {
    const snapshot = await adminFirestore.collection(REQUESTS).where('businessId', '==', businessId).where('status', 'in', ['open', 'acknowledged', 'scheduled']).count().get();
    return snapshot.data().count;
  }

  async createCost(input: Omit<MaintenanceCost, 'createdAt' | 'voided'>): Promise<string> {
    const ref = await adminFirestore.collection(COSTS).add({ ...input, voided: null, createdAt: FieldValue.serverTimestamp() });
    return ref.id;
  }

  async findCost(businessId: string, id: string): Promise<MaintenanceCost | null> {
    const snapshot = await adminFirestore.collection(COSTS).doc(id).get();
    const data = snapshot.data() as MaintenanceCost | undefined;
    return data && data.businessId === businessId ? data : null;
  }

  async voidCost(businessId: string, id: string, by: string, reason: string): Promise<void> {
    const ref = adminFirestore.collection(COSTS).doc(id);
    await adminFirestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const current = snapshot.data() as MaintenanceCost | undefined;
      if (!current || current.businessId !== businessId) throw new MaintenanceNotFoundError('Cost', id);
      if (current.voided) throw new MaintenanceStateError('This cost is already voided');
      tx.update(ref, { voided: { at: Timestamp.now(), by, reason } });
    });
  }

  /** Costs on one machine whose `occurredOn` falls in `[fromDate, toDate]` (Nairobi dates, inclusive), voided ones included. */
  async listCostsForMachine(businessId: string, machineId: string, range: { fromDate?: string; toDate?: string } = {}, limit = 500): Promise<Row<MaintenanceCost>[]> {
    let query: FirebaseFirestore.Query = adminFirestore.collection(COSTS).where('businessId', '==', businessId).where('machineId', '==', machineId);
    if (range.fromDate) query = query.where('occurredOn', '>=', range.fromDate);
    if (range.toDate) query = query.where('occurredOn', '<=', range.toDate);
    const snapshot = await query.orderBy('occurredOn', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as MaintenanceCost }));
  }

  /** The most recent costs across the business, newest first. */
  async listRecentCosts(businessId: string, limit = 100): Promise<Row<MaintenanceCost>[]> {
    const snapshot = await adminFirestore.collection(COSTS).where('businessId', '==', businessId).orderBy('occurredOn', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as MaintenanceCost }));
  }

  async listCostsForRequest(businessId: string, requestId: string): Promise<Row<MaintenanceCost>[]> {
    const snapshot = await adminFirestore.collection(COSTS).where('businessId', '==', businessId).where('requestId', '==', requestId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as MaintenanceCost }));
  }
}

export const maintenanceRepository = new MaintenanceRepository();
