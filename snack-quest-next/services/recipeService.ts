import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';

import { snackItemRepository } from '@/repositories/snackItemRepository';
import { boxRecipeRepository } from '@/repositories/boxRecipeRepository';
import { packageRepository } from '@/repositories/packageRepository';
import type { BoxRecipeItem, SnackItem } from '@/types';

export class RecipeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeValidationError';
  }
}

export class SnackItemNotFoundError extends Error {
  constructor(itemId: string) {
    super(`Snack item ${itemId} not found`);
    this.name = 'SnackItemNotFoundError';
  }
}

export interface SnackItemDraft {
  name: string;
  imageUrl: string | null;
  expectedUnitCostKes: number;
  unitLabel: string;
  origin: string | null;
  sourcingNote: string | null;
  availableForPremiumSelection?: boolean;
  /** null = untracked, never zero. */
  stockCount?: number | null;
  isActive: boolean;
}

/** A recipe with its snacks resolved — what every fulfilment screen actually renders. */
export interface ResolvedRecipeLine {
  snackItemId: string;
  quantity: number;
  /** Null when the recipe references a snack that has since been deleted from the catalogue. Surfaced rather than dropped, so a recipe that is quietly incomplete says so. */
  item: SnackItem | null;
  /** `quantity × expectedUnitCostKes`, or 0 when the item is missing. */
  lineCostKes: number;
}

export interface ResolvedRecipe {
  packageId: string;
  packageName: string;
  notes: string;
  lines: ResolvedRecipeLine[];
  /** What one box costs to fill, at expected prices. The number that decides whether a box's retail price actually works. */
  totalCostKes: number;
  /** Lines whose snack no longer exists. Non-empty means the recipe needs attention before the next shop. */
  missingItemIds: string[];
}

/**
 * The snack catalogue and box recipes (§ Box Recipes).
 *
 * Resolution lives here rather than in the views because three separate
 * screens need the same joined shape — the admin recipe builder, the
 * warehouse recipe card, and the shopping run aggregator — and a join
 * repeated in three places is a join that will eventually differ in
 * three places.
 */
class RecipeService {
  async listSnackItems(businessId: string, options: { activeOnly?: boolean } = {}) {
    return snackItemRepository.listByBusiness(businessId, options);
  }

  async getSnackItem(businessId: string, itemId: string): Promise<SnackItem> {
    const item = await snackItemRepository.findById(itemId);
    if (!item || item.businessId !== businessId) {
      throw new SnackItemNotFoundError(itemId);
    }
    return item;
  }

  async createSnackItem(businessId: string, draft: SnackItemDraft, actor: string): Promise<string> {
    const validated = this.validateSnackItem(draft);
    return snackItemRepository.create({ businessId, ...validated }, actor);
  }

  async updateSnackItem(businessId: string, itemId: string, draft: SnackItemDraft, actor: string): Promise<void> {
    await this.getSnackItem(businessId, itemId);
    const validated = this.validateSnackItem(draft);
    await snackItemRepository.update(itemId, {
      ...validated,
      // Explicitly removed rather than omitted: an absent key on an
      // update means "leave it alone", so clearing the stock box in
      // Admin would otherwise keep the old count forever.
      ...(typeof draft.stockCount === 'number' ? {} : { stockCount: FieldValue.delete() }),
      updatedBy: actor,
    });
  }

  /**
   * Deletes a snack outright.
   *
   * Refuses while any recipe still references it. The alternative —
   * deleting anyway — leaves recipes pointing at nothing, which the
   * resolver would render as a gap in a box nobody asked for. Marking
   * the snack inactive is the way to retire one that is still in use,
   * which is what `isActive` is for.
   */
  async deleteSnackItem(businessId: string, itemId: string): Promise<void> {
    await this.getSnackItem(businessId, itemId);

    const recipes = await boxRecipeRepository.listByBusiness(businessId);
    const usedBy = recipes.filter((recipe) => recipe.items.some((line) => line.snackItemId === itemId));
    if (usedBy.length > 0) {
      throw new RecipeValidationError(
        `This snack is still in ${usedBy.length} box recipe${usedBy.length === 1 ? '' : 's'}. Remove it from those first, or mark it inactive to keep it out of new ones.`,
      );
    }

    await snackItemRepository.delete(itemId);
  }

  async getRecipe(businessId: string, packageId: string): Promise<ResolvedRecipe | null> {
    const [recipe, box] = await Promise.all([
      boxRecipeRepository.findByPackageId(businessId, packageId),
      packageRepository.findById(businessId, packageId),
    ]);
    if (!recipe) {
      return null;
    }

    const items = await snackItemRepository.findManyById(recipe.items.map((line) => line.snackItemId));
    return this.resolve(packageId, box?.name ?? 'Unknown box', recipe.notes, recipe.items, items);
  }

  /** Every box with its recipe status — the admin overview, and what tells you which boxes cannot be shopped for yet. */
  async listRecipeCoverage(businessId: string): Promise<
    { packageId: string; packageName: string; priceKes: number; itemCount: number; totalCostKes: number; hasRecipe: boolean }[]
  > {
    const [boxes, recipes] = await Promise.all([
      packageRepository.listActive(businessId),
      boxRecipeRepository.listByBusiness(businessId),
    ]);
    const byPackageId = new Map(recipes.map((recipe) => [recipe.packageId, recipe]));

    const allItemIds = recipes.flatMap((recipe) => recipe.items.map((line) => line.snackItemId));
    const items = await snackItemRepository.findManyById(allItemIds);

    return boxes.map(({ id, data }) => {
      const recipe = byPackageId.get(id);
      if (!recipe) {
        return { packageId: id, packageName: data.name, priceKes: data.priceKes, itemCount: 0, totalCostKes: 0, hasRecipe: false };
      }
      const resolved = this.resolve(id, data.name, recipe.notes, recipe.items, items);
      return {
        packageId: id,
        packageName: data.name,
        priceKes: data.priceKes,
        itemCount: recipe.items.length,
        totalCostKes: resolved.totalCostKes,
        hasRecipe: true,
      };
    });
  }

  /**
   * Replaces a box's recipe.
   *
   * Every referenced snack is checked to exist and belong to this
   * business before anything is written — a recipe that references a
   * snack from another tenant, or one that was deleted between the
   * composer loading and saving, would otherwise only fail later, on a
   * warehouse phone, mid-shop.
   */
  async saveRecipe(
    businessId: string,
    packageId: string,
    input: { items: BoxRecipeItem[]; notes: string },
    actor: string,
  ): Promise<void> {
    const box = await packageRepository.findById(businessId, packageId);
    if (!box) {
      throw new RecipeValidationError('That box does not exist.');
    }

    const cleaned: BoxRecipeItem[] = [];
    const seen = new Set<string>();
    for (const line of input.items) {
      if (!line.snackItemId || seen.has(line.snackItemId)) {
        // A snack listed twice is one line with a bigger quantity, not
        // two lines — the runner should see "6 Pocky", never "3 Pocky"
        // twice on the same list.
        continue;
      }
      /*
       * Rejected rather than rounded. Flooring would turn a typed
       * "1.5" into 1 and a "3.7" into 3 without telling anyone — a
       * silent change to how many snacks go in a box, which is the
       * exact class of error this feature exists to prevent. Half a
       * bag of Pocky is not a thing you can buy.
       */
      const quantity = Number(line.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new RecipeValidationError('Every snack needs a whole-number quantity of at least 1.');
      }
      seen.add(line.snackItemId);
      cleaned.push({ snackItemId: line.snackItemId, quantity });
    }

    const resolved = await snackItemRepository.findManyById(cleaned.map((line) => line.snackItemId));
    for (const line of cleaned) {
      const item = resolved.get(line.snackItemId);
      if (!item || item.businessId !== businessId) {
        throw new SnackItemNotFoundError(line.snackItemId);
      }
    }

    await boxRecipeRepository.upsert(businessId, packageId, { items: cleaned, notes: (input.notes ?? '').trim() }, actor);
  }

  async deleteRecipe(businessId: string, packageId: string): Promise<void> {
    await boxRecipeRepository.delete(businessId, packageId);
  }

  private resolve(
    packageId: string,
    packageName: string,
    notes: string,
    recipeItems: BoxRecipeItem[],
    items: Map<string, SnackItem>,
  ): ResolvedRecipe {
    const missingItemIds: string[] = [];
    const lines: ResolvedRecipeLine[] = recipeItems.map((line) => {
      const item = items.get(line.snackItemId) ?? null;
      if (!item) {
        missingItemIds.push(line.snackItemId);
      }
      return {
        snackItemId: line.snackItemId,
        quantity: line.quantity,
        item,
        lineCostKes: item ? item.expectedUnitCostKes * line.quantity : 0,
      };
    });

    return {
      packageId,
      packageName,
      notes,
      lines,
      totalCostKes: lines.reduce((total, line) => total + line.lineCostKes, 0),
      missingItemIds,
    };
  }

  /**
   * Returns what actually gets stored, which is not the same shape as
   * what a form submits: the draft carries `stockCount: null` for
   * "untracked", and untracked is stored as an absent field rather
   * than a null.
   */
  private validateSnackItem(draft: SnackItemDraft): Omit<SnackItemDraft, 'stockCount'> & { stockCount?: number } {
    const name = (draft.name ?? '').trim();
    const unitLabel = (draft.unitLabel ?? '').trim() || 'unit';

    if (!name) {
      throw new RecipeValidationError('The snack needs a name specific enough to buy it — include the size or flavour.');
    }
    const cost = Number(draft.expectedUnitCostKes);
    if (!Number.isFinite(cost) || cost < 0) {
      throw new RecipeValidationError('The expected cost must be a number, and cannot be negative.');
    }

    return {
      name,
      imageUrl: draft.imageUrl?.trim() || null,
      expectedUnitCostKes: Math.round(cost),
      unitLabel,
      origin: draft.origin?.trim() || null,
      sourcingNote: draft.sourcingNote?.trim() || null,
      isActive: draft.isActive !== false,
      availableForPremiumSelection: draft.availableForPremiumSelection === true,
      // Absent key rather than `undefined`, which Firestore rejects —
      // and absent is exactly what "untracked" is stored as.
      ...(typeof draft.stockCount === 'number' ? { stockCount: draft.stockCount } : {}),
    };
  }
}

export const recipeService = new RecipeService();
export { RecipeService };
