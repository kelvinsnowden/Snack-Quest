import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { OwnerWholesaleSale, StockTransfer } from '@/types';

const TRANSFERS = 'stockTransfers';
const WHOLESALE = 'ownerWholesaleSales';

export type StockTransferInput = Omit<StockTransfer, 'createdAt'>;
export type OwnerWholesaleSaleInput = Omit<OwnerWholesaleSale, 'createdAt'>;

/**
 * The inventory transfer ledger. Entries are only ever added — always inside
 * the same transaction as the stock movement they describe, so the ledger
 * and the slot counts can't disagree about what happened.
 */
class StockTransferRepository {
  createInTransaction(tx: Transaction, input: StockTransferInput): string {
    const ref = adminFirestore.collection(TRANSFERS).doc();
    tx.set(ref, { ...input, createdAt: FieldValue.serverTimestamp() });
    return ref.id;
  }

  newWholesaleSaleRef() {
    return adminFirestore.collection(WHOLESALE).doc();
  }

  createWholesaleSaleInTransaction(tx: Transaction, ref: FirebaseFirestore.DocumentReference, input: OwnerWholesaleSaleInput): void {
    tx.set(ref, { ...input, createdAt: FieldValue.serverTimestamp() });
  }

  async listByRestockTask(businessId: string, restockTaskId: string): Promise<{ id: string; data: StockTransfer }[]> {
    const snapshot = await adminFirestore.collection(TRANSFERS).where('businessId', '==', businessId).where('restockTaskId', '==', restockTaskId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as StockTransfer }));
  }

  async listByMachine(businessId: string, machineId: string, limit = 200): Promise<{ id: string; data: StockTransfer }[]> {
    const snapshot = await adminFirestore.collection(TRANSFERS).where('businessId', '==', businessId).where('machineId', '==', machineId).orderBy('createdAt', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as StockTransfer }));
  }

  async listWholesaleSalesByPartner(businessId: string, partnerId: string, limit = 200): Promise<{ id: string; data: OwnerWholesaleSale }[]> {
    const snapshot = await adminFirestore.collection(WHOLESALE).where('businessId', '==', businessId).where('partnerId', '==', partnerId).orderBy('createdAt', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as OwnerWholesaleSale }));
  }

  async listWholesaleSalesByMachine(businessId: string, machineId: string, limit = 200): Promise<{ id: string; data: OwnerWholesaleSale }[]> {
    const snapshot = await adminFirestore.collection(WHOLESALE).where('businessId', '==', businessId).where('machineId', '==', machineId).orderBy('createdAt', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as OwnerWholesaleSale }));
  }
}

export const stockTransferRepository = new StockTransferRepository();
