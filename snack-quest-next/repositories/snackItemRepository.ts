import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { isSelectableSnack } from '@/lib/packages/guaranteedPicks';
import type { AuditFields, SnackItem } from '@/types';

/**
 * `snackItems` reads/writes (§ Box Recipes) — the shared snack
 * catalogue. Persistence only, same discipline as every other
 * Repository.
 */

const COLLECTION = 'snackItems';

export type SnackItemInput = Omit<SnackItem, keyof AuditFields>;
/**
 * `FieldValue` is allowed for `stockCount` so an admin clearing the
 * box actually clears it. Omitting the key on an update leaves the old
 * number in place, which would quietly keep a snack "tracked" at a
 * level nobody set — see `SnackItem.stockCount`.
 */
export type SnackItemUpdate = Partial<Omit<SnackItemInput, 'stockCount'>> & {
  updatedBy: string;
  stockCount?: number | FieldValue;
};

class SnackItemRepository {
  async findById(itemId: string): Promise<SnackItem | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(itemId).get();
    return snapshot.exists ? (snapshot.data() as SnackItem) : null;
  }

  /**
   * Several snacks in one round trip, keyed by id.
   *
   * `getAll` rather than a loop of reads: a recipe resolves every item
   * it references at once, and a shopping run resolves every item
   * across every recipe in it. Firestore's own batch read is one
   * request regardless of how many ids, where N sequential reads would
   * be N round trips on the critical path of a page a warehouse phone
   * is waiting on. Missing ids are simply absent from the map — a
   * deleted snack still referenced by an old recipe must not throw.
   */
  async findManyById(itemIds: string[]): Promise<Map<string, SnackItem>> {
    const unique = Array.from(new Set(itemIds));
    if (unique.length === 0) {
      return new Map();
    }
    const refs = unique.map((id) => adminFirestore.collection(COLLECTION).doc(id));
    const snapshots = await adminFirestore.getAll(...refs);

    const found = new Map<string, SnackItem>();
    for (const snapshot of snapshots) {
      if (snapshot.exists) {
        found.set(snapshot.id, snapshot.data() as SnackItem);
      }
    }
    return found;
  }

  async create(data: SnackItemInput, actor: string): Promise<string> {
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

  async update(itemId: string, partial: SnackItemUpdate): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(itemId)
      .update({ ...partial, updatedAt: FieldValue.serverTimestamp() });
  }

  async delete(itemId: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(itemId).delete();
  }

  /** The whole catalogue for one business, alphabetical — the order someone scanning a list to find a snack expects. Needs the `businessId ASC, name ASC` composite index. */
  async listByBusiness(businessId: string, options: { activeOnly?: boolean } = {}): Promise<{ id: string; data: SnackItem }[]> {
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId) as FirebaseFirestore.Query;

    if (options.activeOnly) {
      query = query.where('isActive', '==', true);
    }

    const snapshot = await query.orderBy('name', 'asc').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as SnackItem }));
  }

  /**
   * The snacks a customer may choose from on a box that lets them
   * pick (§ Premium: choose 5, discover the rest).
   *
   * Filtered on `availableForPremiumSelection` in the query, but the
   * remaining conditions are applied in memory on purpose: `isActive`
   * would need a composite index for no benefit at this catalogue's
   * size, and `stockCount` cannot be filtered at all, since undefined
   * means untracked rather than zero and Firestore cannot express
   * "absent OR greater than zero" in one query.
   */
  async listSelectableForPremium(businessId: string): Promise<{ id: string; data: SnackItem }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('availableForPremiumSelection', '==', true)
      .get();

    return snapshot.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as SnackItem }))
      .filter(({ data }) => isSelectableSnack(data))
      .sort((a, b) => a.data.name.localeCompare(b.data.name));
  }
}

export const snackItemRepository = new SnackItemRepository();
export { SnackItemRepository };
