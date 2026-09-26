import 'server-only';

import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineSlotDocId, type MachineSlot } from '@/types';

const COLLECTION = 'machineSlots';

export type MachineSlotInput = Omit<MachineSlot, 'createdAt' | 'updatedAt'>;

/**
 * `machineSlots` reads/writes (§ CORE ENTITIES 2). One document per
 * machine+slot, doc-id `{machineId}__{slotCode}` — an upsert target
 * rather than an auto-id, so "the A03 slot on machine M001" is always
 * exactly one document, never a query that could return zero or two.
 */
class MachineSlotRepository {
  async upsert(input: MachineSlotInput): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(machineSlotDocId(input.machineId, input.slotCode));
    const now = FieldValue.serverTimestamp();
    const existing = await ref.get();
    if (existing.exists) {
      // Preserve the original createdAt — this is an update, not a
      // fresh document, even though the call site is the same.
      await ref.set({ ...input, updatedAt: now }, { merge: true });
    } else {
      await ref.set({ ...input, createdAt: now, updatedAt: now });
    }
  }

  async findBySlotCode(businessId: string, machineId: string, slotCode: string): Promise<MachineSlot | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(machineSlotDocId(machineId, slotCode)).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as MachineSlot;
    return data.businessId === businessId ? data : null;
  }

  async listByMachine(businessId: string, machineId: string): Promise<MachineSlot[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .get();
    return snapshot.docs.map((doc) => doc.data() as MachineSlot).sort((a, b) => a.position - b.position);
  }

  /** Every slot in the fleet — the Alert Center's own stockout/stockout-risk sweep. Bounded by fleet slot count, not transaction volume, same accepted scale as `machineRepository.listAllStatuses`. */
  async listByBusiness(businessId: string): Promise<MachineSlot[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).get();
    return snapshot.docs.map((doc) => doc.data() as MachineSlot);
  }

  async updatePrice(businessId: string, machineId: string, slotCode: string, priceKes: number): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(machineSlotDocId(machineId, slotCode));
    const snapshot = await ref.get();
    const data = snapshot.data() as MachineSlot | undefined;
    if (!data || data.businessId !== businessId) {
      throw new Error(`Slot ${slotCode} on machine ${machineId} not found`);
    }
    await ref.update({ priceKes, updatedAt: FieldValue.serverTimestamp() });
  }

  async setEnabled(businessId: string, machineId: string, slotCode: string, enabled: boolean): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(machineSlotDocId(machineId, slotCode));
    const snapshot = await ref.get();
    const data = snapshot.data() as MachineSlot | undefined;
    if (!data || data.businessId !== businessId) {
      throw new Error(`Slot ${slotCode} on machine ${machineId} not found`);
    }
    await ref.update({ enabled, updatedAt: FieldValue.serverTimestamp() });
  }

  /** Reads the slot inside a transaction — for `authorizeVend`/inventory movements, where the quantity read and the quantity written must be the same snapshot. */
  async getInTransaction(tx: Transaction, machineId: string, slotCode: string): Promise<MachineSlot | null> {
    const snapshot = await tx.get(adminFirestore.collection(COLLECTION).doc(machineSlotDocId(machineId, slotCode)));
    return snapshot.exists ? (snapshot.data() as MachineSlot) : null;
  }

  updateQuantityInTransaction(tx: Transaction, machineId: string, slotCode: string, newQuantity: number): void {
    tx.update(adminFirestore.collection(COLLECTION).doc(machineSlotDocId(machineId, slotCode)), {
      currentQuantity: newQuantity,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  getRef(machineId: string, slotCode: string): FirebaseFirestore.DocumentReference {
    return adminFirestore.collection(COLLECTION).doc(machineSlotDocId(machineId, slotCode));
  }
}

export const machineSlotRepository = new MachineSlotRepository();
