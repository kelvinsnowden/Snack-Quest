import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { BoxRecipe, BoxRecipeItem } from '@/types';

/**
 * `boxRecipes` reads/writes (§ Box Recipes) — one recipe per box,
 * keyed by the package it describes so every lookup is a document read
 * rather than a query.
 */

const COLLECTION = 'boxRecipes';

function docId(businessId: string, packageId: string): string {
  return `${businessId}:${packageId}`;
}

class BoxRecipeRepository {
  async findByPackageId(businessId: string, packageId: string): Promise<BoxRecipe | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(docId(businessId, packageId)).get();
    return snapshot.exists ? (snapshot.data() as BoxRecipe) : null;
  }

  /**
   * Recipes for several boxes at once, keyed by packageId — one batch
   * read for a shopping run that spans many different boxes. Boxes with
   * no recipe are absent from the map rather than throwing; the caller
   * is the one that decides what a missing recipe means, and for a
   * shopping run it means a line on `missingRecipePackageIds`.
   */
  async findManyByPackageId(businessId: string, packageIds: string[]): Promise<Map<string, BoxRecipe>> {
    const unique = Array.from(new Set(packageIds));
    if (unique.length === 0) {
      return new Map();
    }
    const refs = unique.map((packageId) => adminFirestore.collection(COLLECTION).doc(docId(businessId, packageId)));
    const snapshots = await adminFirestore.getAll(...refs);

    const found = new Map<string, BoxRecipe>();
    for (const snapshot of snapshots) {
      if (snapshot.exists) {
        const recipe = snapshot.data() as BoxRecipe;
        found.set(recipe.packageId, recipe);
      }
    }
    return found;
  }

  /**
   * Creates or replaces a box's recipe.
   *
   * `set` with merge semantics on the item list deliberately not used:
   * a recipe's items are replaced wholesale, because removing a snack
   * from a box has to actually remove it. Merging would make deletion
   * impossible to express.
   */
  async upsert(
    businessId: string,
    packageId: string,
    data: { items: BoxRecipeItem[]; notes: string },
    actor: string,
  ): Promise<void> {
    const ref = adminFirestore.collection(COLLECTION).doc(docId(businessId, packageId));
    const existing = await ref.get();
    const now = FieldValue.serverTimestamp();

    if (existing.exists) {
      await ref.update({ items: data.items, notes: data.notes, updatedAt: now, updatedBy: actor });
      return;
    }

    await ref.set({
      businessId,
      packageId,
      items: data.items,
      notes: data.notes,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
      deletedAt: null,
    });
  }

  async delete(businessId: string, packageId: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(docId(businessId, packageId)).delete();
  }

  /** Every recipe for one business — used to show which boxes still have none. An equality filter alone needs no composite index. */
  async listByBusiness(businessId: string): Promise<BoxRecipe[]> {
    const snapshot = await adminFirestore.collection(COLLECTION).where('businessId', '==', businessId).get();
    return snapshot.docs.map((doc) => doc.data() as BoxRecipe);
  }
}

export const boxRecipeRepository = new BoxRecipeRepository();
export { BoxRecipeRepository };
