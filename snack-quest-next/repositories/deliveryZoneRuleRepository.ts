import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { DeliveryZoneRule } from '@/types';

const COLLECTION = 'deliveryZoneRules';

function ruleId(
  zone: string,
  shippingOrigin: string,
  packageCategory: string,
  courier: string,
): string {
  // Every zone name with an em dash in it ("Nairobi Metro — Next Day")
  // used to produce a different id here than the one the seed and
  // migration scripts wrote, because only they collapsed the dash into
  // a hyphen. "Upcountry" has no dash, so pickup pricing worked while
  // every door-delivery lookup silently missed and fell back to no fee
  // at all. Both em dash (—) and hyphen (-) are folded the same way
  // whitespace is, so this always matches what those scripts write.
  return `${zone}:${shippingOrigin}:${packageCategory}:${courier}`
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/—/g, '-');
}

export interface UpsertDeliveryZoneRuleInput {
  businessId: string;
  zone: string;
  shippingOrigin: string;
  packageCategory: string;
  courier: string;
  feeKes: number | null;
}

class DeliveryZoneRuleRepository {
  /** § Fix pickup delivery fee revenue leak — every zone this business has a rule row for, priced or not. */
  async listByBusiness(businessId: string): Promise<{ id: string; data: DeliveryZoneRule }[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as DeliveryZoneRule }));
  }

  async findFee(
    businessId: string,
    zone: string,
    shippingOrigin: string,
    packageCategory: string,
    courier: string,
  ): Promise<number | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .doc(ruleId(zone, shippingOrigin, packageCategory, courier))
      .get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as DeliveryZoneRule;
    return data.businessId === businessId ? data.feeKes : null;
  }

  /** Idempotent — re-seeding never clobbers a fee an admin has already set. */
  async upsertIfMissing(input: UpsertDeliveryZoneRuleInput): Promise<void> {
    const ref = adminFirestore
      .collection(COLLECTION)
      .doc(ruleId(input.zone, input.shippingOrigin, input.packageCategory, input.courier));
    const existing = await ref.get();
    if (existing.exists) {
      return;
    }
    const now = FieldValue.serverTimestamp();
    await ref.set({
      businessId: input.businessId,
      zone: input.zone,
      shippingOrigin: input.shippingOrigin,
      packageCategory: input.packageCategory,
      courier: input.courier,
      feeKes: input.feeKes,
      createdAt: now,
      updatedAt: now,
    });
  }

  async setFee(
    businessId: string,
    zone: string,
    shippingOrigin: string,
    packageCategory: string,
    courier: string,
    feeKes: number,
  ): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(ruleId(zone, shippingOrigin, packageCategory, courier))
      .set(
        { businessId, feeKes, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
  }
}

export const deliveryZoneRuleRepository = new DeliveryZoneRuleRepository();
