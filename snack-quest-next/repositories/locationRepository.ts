import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { Location } from '@/types';

const COLLECTION = 'locations';

export type LocationInput = Omit<Location, 'createdAt' | 'updatedAt' | 'deletedAt' | 'updatedBy'>;

export class LocationNotFoundError extends Error {
  constructor(locationId: string) {
    super(`Location ${locationId} not found`);
    this.name = 'LocationNotFoundError';
  }
}

/** `locations` reads/writes (§ LOCATION PROFILE). */
class LocationRepository {
  async create(input: LocationInput): Promise<string> {
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

  async findById(businessId: string, locationId: string): Promise<Location | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(locationId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as Location;
    return data.businessId === businessId && !data.deletedAt ? data : null;
  }

  async listByBusiness(businessId: string): Promise<{ id: string; data: Location }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Location })).filter((row) => !row.data.deletedAt);
  }

  async listByType(businessId: string, locationType: Location['locationType']): Promise<{ id: string; data: Location }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('locationType', '==', locationType)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Location })).filter((row) => !row.data.deletedAt);
  }

  async update(
    businessId: string,
    locationId: string,
    fields: Partial<Omit<Location, 'businessId' | 'createdAt' | 'createdBy' | 'deletedAt'>>,
    actor: string,
  ): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(locationId);
    const snapshot = await ref.get();
    const data = snapshot.data() as Location | undefined;
    if (!data || data.businessId !== businessId || data.deletedAt) {
      throw new LocationNotFoundError(locationId);
    }
    await ref.update({ ...fields, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
  }
}

export const locationRepository = new LocationRepository();
