import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { MachineCostLine, MachineDeal, MachineSaleRecord } from '@/types/machineDeal';

const COSTS = 'machineCostLines';
const DEALS = 'machineDeals';

type StoredTimestamp = MachineDeal['updatedAt'];
type Row<T> = { id: string; data: T };
const nowStamp = (): StoredTimestamp => Timestamp.now() as unknown as StoredTimestamp;

export class MachineDealStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MachineDealStateError';
  }
}

export class MachineDealNotFoundError extends Error {
  constructor(id: string) {
    super(`Machine cost ${id} not found`);
    this.name = 'MachineDealNotFoundError';
  }
}

const emptyDeal = (businessId: string, machineId: string): MachineDeal => ({ businessId, machineId, sale: null, cancelledSales: [], noInstallationCost: false, updatedAt: nowStamp() });

class MachineDealRepository {
  async createCost(input: Omit<MachineCostLine, 'createdAt' | 'voided'>): Promise<string> {
    const ref = await adminFirestore.collection(COSTS).add({ ...input, voided: null, createdAt: FieldValue.serverTimestamp() });
    return ref.id;
  }

  async voidCost(businessId: string, id: string, by: string, reason: string): Promise<MachineCostLine> {
    const ref = adminFirestore.collection(COSTS).doc(id);
    return adminFirestore.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data() as MachineCostLine | undefined;
      if (!current || current.businessId !== businessId) throw new MachineDealNotFoundError(id);
      if (current.voided) throw new MachineDealStateError('This cost is already voided.');
      tx.update(ref, { voided: { at: Timestamp.now(), by, reason } });
      return current;
    });
  }

  /** Every cost line on one machine, voided ones included, newest first. */
  async listCosts(businessId: string, machineId: string): Promise<Row<MachineCostLine>[]> {
    const snapshot = await adminFirestore.collection(COSTS).where('businessId', '==', businessId).where('machineId', '==', machineId).orderBy('occurredOn', 'desc').limit(500).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as MachineCostLine }));
  }

  /** Every live (not voided) cost line in the business — for the fleet view. */
  async listAllLiveCosts(businessId: string): Promise<Row<MachineCostLine>[]> {
    const snapshot = await adminFirestore.collection(COSTS).where('businessId', '==', businessId).where('voided', '==', null).limit(5000).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as MachineCostLine }));
  }

  async getDeal(businessId: string, machineId: string): Promise<MachineDeal | null> {
    const data = (await adminFirestore.collection(DEALS).doc(machineId).get()).data() as MachineDeal | undefined;
    return data && data.businessId === businessId ? data : null;
  }

  async listDeals(businessId: string): Promise<MachineDeal[]> {
    const snapshot = await adminFirestore.collection(DEALS).where('businessId', '==', businessId).limit(5000).get();
    return snapshot.docs.map((doc) => doc.data() as MachineDeal);
  }

  /** Records the sale, in a transaction: a machine has at most one live sale. */
  async recordSale(businessId: string, machineId: string, sale: Omit<MachineSaleRecord, 'recordedAt'>): Promise<MachineSaleRecord> {
    const ref = adminFirestore.collection(DEALS).doc(machineId);
    return adminFirestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const current = snapshot.exists ? (snapshot.data() as MachineDeal) : emptyDeal(businessId, machineId);
      if (current.businessId !== businessId) throw new MachineDealStateError('Machine not found.');
      if (current.sale) throw new MachineDealStateError('This machine already has a sale recorded. Cancel it first to record a different one.');
      const record: MachineSaleRecord = { ...sale, recordedAt: nowStamp() };
      tx.set(ref, { ...current, sale: record, updatedAt: nowStamp() });
      return record;
    });
  }

  /** Cancels the live sale with a reason; it is kept in `cancelledSales`, never deleted. */
  async cancelSale(businessId: string, machineId: string, by: string, reason: string): Promise<MachineSaleRecord> {
    const ref = adminFirestore.collection(DEALS).doc(machineId);
    return adminFirestore.runTransaction(async (tx) => {
      const current = (await tx.get(ref)).data() as MachineDeal | undefined;
      if (!current || current.businessId !== businessId || !current.sale) throw new MachineDealStateError('There is no sale to cancel on this machine.');
      const cancelled = { ...current.sale, cancelledAt: nowStamp(), cancelledBy: by, reason };
      tx.set(ref, { ...current, sale: null, cancelledSales: [...current.cancelledSales, cancelled].slice(-20), updatedAt: nowStamp() });
      return current.sale;
    });
  }

  async setNoInstallationCost(businessId: string, machineId: string, value: boolean): Promise<void> {
    const ref = adminFirestore.collection(DEALS).doc(machineId);
    await adminFirestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const current = snapshot.exists ? (snapshot.data() as MachineDeal) : emptyDeal(businessId, machineId);
      if (current.businessId !== businessId) throw new MachineDealStateError('Machine not found.');
      tx.set(ref, { ...current, noInstallationCost: value, updatedAt: nowStamp() });
    });
  }
}

export const machineDealRepository = new MachineDealRepository();
