import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { KioskScreenImage } from '@/types';

const COLLECTION = 'kioskScreenImages';

export type KioskScreenImageInput = Omit<KioskScreenImage, 'createdAt' | 'updatedAt' | 'updatedBy'>;

export class KioskScreenImageNotFoundError extends Error {
  constructor(imageId: string) {
    super(`Kiosk screen image ${imageId} not found`);
    this.name = 'KioskScreenImageNotFoundError';
  }
}

/** `kioskScreenImages` reads/writes. Every query is scoped by `businessId`; a document from another tenant reads as not found. */
class KioskScreenImageRepository {
  async create(input: KioskScreenImageInput): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({ ...input, updatedBy: input.createdBy, createdAt: now, updatedAt: now });
    return ref.id;
  }

  async findById(businessId: string, imageId: string): Promise<KioskScreenImage | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(imageId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as KioskScreenImage;
    return data.businessId === businessId ? data : null;
  }

  async listByBusiness(businessId: string): Promise<{ id: string; data: KioskScreenImage }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as KioskScreenImage }));
  }

  /** One scope's images: a machine's own (`machineId`) or the fleet-wide set (`null`). */
  async listByScope(businessId: string, machineId: string | null): Promise<{ id: string; data: KioskScreenImage }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('machineId', '==', machineId)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as KioskScreenImage }));
  }

  async update(
    businessId: string,
    imageId: string,
    fields: Partial<Pick<KioskScreenImage, 'altText' | 'active' | 'displayOrder'>>,
    actor: string,
  ): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(imageId);
    const snapshot = await ref.get();
    const data = snapshot.data() as KioskScreenImage | undefined;
    if (!data || data.businessId !== businessId) {
      throw new KioskScreenImageNotFoundError(imageId);
    }
    await ref.update({ ...fields, updatedBy: actor, updatedAt: FieldValue.serverTimestamp() });
  }

  /**
   * Rewrites one group's order in a single batch, so a reorder never
   * leaves two images sharing a position. The caller has already
   * checked every id belongs to the same tenant, placement and scope.
   */
  async setOrder(orderedIds: string[], actor: string): Promise<void> {
    const batch = adminFirestore.batch();
    orderedIds.forEach((id, index) => {
      batch.update(adminFirestore.collection(COLLECTION).doc(id), {
        displayOrder: index,
        updatedBy: actor,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }

  async delete(businessId: string, imageId: string): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(imageId);
    const snapshot = await ref.get();
    const data = snapshot.data() as KioskScreenImage | undefined;
    if (!data || data.businessId !== businessId) {
      throw new KioskScreenImageNotFoundError(imageId);
    }
    await ref.delete();
  }
}

export const kioskScreenImageRepository = new KioskScreenImageRepository();
