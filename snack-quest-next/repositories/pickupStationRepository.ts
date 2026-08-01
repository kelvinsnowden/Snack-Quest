import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { searchStations } from '@/lib/pickupStations/search';
import type { AuditFields, PickupStation } from '@/types';

const COLLECTION = 'pickupStations';

export type PickupStationInput = Omit<PickupStation, keyof AuditFields>;

class PickupStationRepository {
  async listActive(businessId: string): Promise<{ id: string; data: PickupStation }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('isActive', '==', true)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as PickupStation }));
  }

  /** § Fix pickup delivery fee revenue leak — every station regardless of `isActive`, so a reactivated station always carries the right fee. */
  async listByBusiness(businessId: string): Promise<{ id: string; data: PickupStation }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as PickupStation }));
  }

  /**
   * Propagates a zone's fee onto every station in it — `deliveryFeeKes`
   * is deliberately denormalized onto each station for fast reads at
   * checkout (types/pickupStation.ts), so a zone-level price change has
   * to fan out here rather than living only on `deliveryZoneRules`.
   * One `businessId`-scoped scan + in-memory filter, matching
   * `search()`'s own precedent above for why that's the right call at
   * today's scale — a 5-field composite index for this would be a real
   * index to deploy for a write that happens rarely.
   */
  async batchSetDeliveryFeeForZone(
    businessId: string,
    key: { zone: string; shippingOrigin: string; packageCategory: string; courier: string },
    feeKes: number,
    actor: string,
  ): Promise<number> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).get();
    const matches = snapshot.docs.filter((doc) => {
      const data = doc.data() as PickupStation;
      return (
        data.zone === key.zone &&
        data.shippingOrigin === key.shippingOrigin &&
        data.packageCategory === key.packageCategory &&
        data.courier === key.courier
      );
    });

    const BATCH_LIMIT = 500;
    for (let i = 0; i < matches.length; i += BATCH_LIMIT) {
      const batch = adminFirestore.batch();
      for (const doc of matches.slice(i, i + BATCH_LIMIT)) {
        batch.update(doc.ref, { deliveryFeeKes: feeKes, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor });
      }
      await batch.commit();
    }
    return matches.length;
  }

  async findById(businessId: string, stationId: string): Promise<PickupStation | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(stationId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as PickupStation;
    return data.businessId === businessId ? data : null;
  }

  /**
   * County/town/name/fuzzy search in one call — fetches this
   * business's active stations and ranks them with
   * `lib/pickupStations/search.ts`. See that module's own note on why
   * an in-memory pass is the right call at today's scale.
   */
  async search(
    businessId: string,
    query: string,
    limit = 8,
  ): Promise<{ id: string; data: PickupStation }[]> {
    const active = await this.listActive(businessId);
    const candidates = active.map(({ id, data }) => ({
      id,
      name: data.name,
      county: data.county,
      town: data.town,
    }));
    const matches = searchStations(query, candidates, limit);
    const byId = new Map(active.map((entry) => [entry.id, entry.data]));
    return matches.map((match) => ({ id: match.id, data: byId.get(match.id)! }));
  }

  async create(data: PickupStationInput, actor: string): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...data,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
      deletedAt: null,
    });
    return ref.id;
  }
}

export const pickupStationRepository = new PickupStationRepository();
