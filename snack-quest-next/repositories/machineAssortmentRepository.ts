import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineAssortmentDocId, type MachineAssortment, type MachineAssortmentPriceHistoryEntry } from '@/types';

const COLLECTION = 'machineAssortments';
const PRICE_HISTORY_COLLECTION = 'machineAssortmentPriceHistory';

export type MachineAssortmentInput = Omit<MachineAssortment, 'createdAt' | 'updatedAt'>;

export class MachineAssortmentNotFoundError extends Error {
  constructor(machineId: string, productId: string) {
    super(`No assortment row for product ${productId} on machine ${machineId}`);
    this.name = 'MachineAssortmentNotFoundError';
  }
}

/**
 * `machineAssortments` reads/writes (§ MACHINE ASSORTMENT). One
 * document per machine+product, doc-id
 * `{machineId}__{productCatalogue}__{productId}` — the same
 * upsert-target discipline `machineSlotRepository` already uses for
 * `{machineId}__{slotCode}`, so "is product X assorted to machine Y"
 * is always exactly one document, never a query that could return two.
 */
class MachineAssortmentRepository {
  async upsert(input: MachineAssortmentInput): Promise<void> {
    const ref = adminFirestore
      .collection(COLLECTION)
      .doc(machineAssortmentDocId(input.machineId, input.productCatalogue, input.productId));
    const now = FieldValue.serverTimestamp();
    const existing = await ref.get();
    if (existing.exists) {
      await ref.set({ ...input, updatedAt: now }, { merge: true });
    } else {
      await ref.set({ ...input, createdAt: now, updatedAt: now });
    }
  }

  async findByProduct(
    businessId: string,
    machineId: string,
    productCatalogue: MachineAssortment['productCatalogue'],
    productId: string,
  ): Promise<MachineAssortment | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(machineAssortmentDocId(machineId, productCatalogue, productId)).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as MachineAssortment;
    return data.businessId === businessId ? data : null;
  }

  /** Every assortment row for a machine, regardless of `assorted`/`visible` — the admin/staff view. */
  async listByMachine(businessId: string, machineId: string): Promise<MachineAssortment[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .get();
    return snapshot.docs.map((doc) => doc.data() as MachineAssortment).sort((a, b) => a.displayOrder - b.displayOrder);
  }

  /**
   * Sets `priceOverrideKes` and appends the audit-trail entry in one
   * write path — never one without the other, so the history can
   * never drift from what the field actually holds (§ MACHINE-SPECIFIC
   * PRICING).
   */
  async setPriceOverride(
    businessId: string,
    machineId: string,
    productCatalogue: MachineAssortment['productCatalogue'],
    productId: string,
    newPriceOverrideKes: number | null,
    actor: string,
  ): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(machineAssortmentDocId(machineId, productCatalogue, productId));
    const snapshot = await ref.get();
    const data = snapshot.data() as MachineAssortment | undefined;
    if (!data || data.businessId !== businessId) {
      throw new MachineAssortmentNotFoundError(machineId, productId);
    }
    const now = FieldValue.serverTimestamp();
    await ref.update({ priceOverrideKes: newPriceOverrideKes, updatedAt: now });
    const historyEntry: Omit<MachineAssortmentPriceHistoryEntry, 'createdAt'> = {
      businessId,
      machineId,
      productId,
      productCatalogue,
      previousPriceOverrideKes: data.priceOverrideKes,
      newPriceOverrideKes,
      actor,
    };
    await adminFirestore.collection(PRICE_HISTORY_COLLECTION).add({ ...historyEntry, createdAt: now });
  }

  async listPriceHistory(businessId: string, machineId: string, productId: string): Promise<MachineAssortmentPriceHistoryEntry[]> {
    const snapshot = await adminFirestore
      .collection(PRICE_HISTORY_COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .where('productId', '==', productId)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map((doc) => doc.data() as MachineAssortmentPriceHistoryEntry);
  }
}

export const machineAssortmentRepository = new MachineAssortmentRepository();
