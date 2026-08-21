import 'server-only';

import { shoppingRunRepository } from '@/repositories/shoppingRunRepository';
import { boxRecipeRepository } from '@/repositories/boxRecipeRepository';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { orderRepository } from '@/repositories/orderRepository';
import type { ShoppingRun, ShoppingRunLine } from '@/types';

export class ShoppingRunValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShoppingRunValidationError';
  }
}

export class ShoppingRunNotFoundError extends Error {
  constructor(runId: string) {
    super(`Shopping run ${runId} not found`);
    this.name = 'ShoppingRunNotFoundError';
  }
}

export interface RecordLineInput {
  snackItemId: string;
  purchased?: boolean;
  actualUnitCostKes?: number | null;
  actualQuantity?: number | null;
  note?: string | null;
}

/**
 * Shopping runs (§ Box Recipes) — turning a group of orders into one
 * list of snacks to buy, and recording what was really bought.
 *
 * The aggregation is the point. Snack Quest does not shop per order
 * (`FulfillmentBatch`'s own comment says so), so a runner holding six
 * separate box recipes has to add up the Pocky themselves, at a market,
 * on a phone. Doing that arithmetic here instead is the difference
 * between a list you read and a list you have to compute.
 */
class ShoppingRunService {
  /**
   * Builds a run from a set of orders.
   *
   * Quantities come from each order's `items` subcollection rather than
   * assuming one box per order, because an order genuinely can be for
   * more than one box, and buying half of what a customer paid for is
   * the kind of error that is only discovered at packing time.
   */
  async createRun(businessId: string, orderIds: string[], actor: string): Promise<string> {
    const unique = Array.from(new Set(orderIds.filter(Boolean)));
    if (unique.length === 0) {
      throw new ShoppingRunValidationError('Pick at least one order to shop for.');
    }

    const orders = await Promise.all(unique.map((orderId) => orderRepository.findById(orderId)));
    const owned = orders.filter((order): order is NonNullable<typeof order> => Boolean(order && order.businessId === businessId));
    if (owned.length === 0) {
      throw new ShoppingRunValidationError('None of those orders could be found.');
    }

    // How many of each box, across every order in the run.
    const boxQuantities = new Map<string, number>();
    await Promise.all(
      unique.map(async (orderId, index) => {
        const order = orders[index];
        if (!order || order.businessId !== businessId) {
          return;
        }
        const items = await orderRepository.listItems(orderId);
        if (items.length === 0) {
          // Orders predating the items subcollection, and any order
          // whose items failed to write, still represent one real box
          // of the package named on the order itself. Counting them as
          // zero would silently under-buy.
          boxQuantities.set(order.product.packageId, (boxQuantities.get(order.product.packageId) ?? 0) + 1);
          return;
        }
        for (const item of items) {
          boxQuantities.set(item.packageId, (boxQuantities.get(item.packageId) ?? 0) + item.quantity);
        }
      }),
    );

    const recipes = await boxRecipeRepository.findManyByPackageId(businessId, Array.from(boxQuantities.keys()));

    // How many of each snack, across every box.
    const snackQuantities = new Map<string, number>();
    const missingRecipePackageIds: string[] = [];
    for (const [packageId, boxCount] of boxQuantities) {
      const recipe = recipes.get(packageId);
      if (!recipe) {
        missingRecipePackageIds.push(packageId);
        continue;
      }
      for (const line of recipe.items) {
        snackQuantities.set(line.snackItemId, (snackQuantities.get(line.snackItemId) ?? 0) + line.quantity * boxCount);
      }
    }

    const items = await snackItemRepository.findManyById(Array.from(snackQuantities.keys()));

    const lines: ShoppingRunLine[] = [];
    for (const [snackItemId, quantityNeeded] of snackQuantities) {
      const item = items.get(snackItemId);
      if (!item) {
        // Referenced by a recipe but gone from the catalogue. Nothing
        // useful can be put on a shopping list for it — no name, no
        // photo, no price — so it is left off, and the recipe screen is
        // where that gap is reported (`ResolvedRecipe.missingItemIds`).
        continue;
      }
      lines.push({
        snackItemId,
        nameSnapshot: item.name,
        imageUrlSnapshot: item.imageUrl,
        unitLabelSnapshot: item.unitLabel,
        sourcingNoteSnapshot: item.sourcingNote,
        expectedUnitCostKes: item.expectedUnitCostKes,
        quantityNeeded,
        actualUnitCostKes: null,
        actualQuantity: null,
        purchased: false,
        note: null,
      });
    }

    if (lines.length === 0) {
      throw new ShoppingRunValidationError(
        'None of those orders have a box recipe yet, so there is nothing to buy. Add a recipe to the boxes first.',
      );
    }

    lines.sort((a, b) => a.nameSnapshot.localeCompare(b.nameSnapshot));

    return shoppingRunRepository.create(
      {
        businessId,
        orderIds: unique,
        orderCount: unique.length,
        status: 'open',
        lines,
        expectedTotalKes: lines.reduce((total, line) => total + line.expectedUnitCostKes * line.quantityNeeded, 0),
        actualTotalKes: 0,
        missingRecipePackageIds,
        completedAt: null,
        completedBy: null,
        notes: '',
      },
      actor,
    );
  }

  async getRun(businessId: string, runId: string): Promise<ShoppingRun> {
    const run = await shoppingRunRepository.findById(runId);
    if (!run || run.businessId !== businessId) {
      throw new ShoppingRunNotFoundError(runId);
    }
    return run;
  }

  async listRuns(businessId: string, options: { limit?: number; cursor?: string } = {}) {
    return shoppingRunRepository.listByBusiness(businessId, options);
  }

  /**
   * Records what was actually bought for one snack.
   *
   * Only the fields the caller supplied are changed — ticking a line
   * off at the shelf and pricing it at the till are separate moments,
   * and the second must not wipe the first. The run total is recomputed
   * from the resulting lines in the same write.
   */
  async recordLine(businessId: string, runId: string, input: RecordLineInput, actor: string): Promise<ShoppingRun> {
    const run = await this.getRun(businessId, runId);
    if (run.status === 'completed') {
      throw new ShoppingRunValidationError('This run is closed. Reopen it before changing what was bought.');
    }

    const index = run.lines.findIndex((line) => line.snackItemId === input.snackItemId);
    if (index === -1) {
      throw new ShoppingRunValidationError('That snack is not on this run.');
    }

    const actualUnitCostKes = normalizeMoney(input.actualUnitCostKes);
    const actualQuantity = normalizeCount(input.actualQuantity);

    const lines = run.lines.map((line, i) =>
      i !== index
        ? line
        : {
            ...line,
            purchased: input.purchased ?? line.purchased,
            actualUnitCostKes: input.actualUnitCostKes === undefined ? line.actualUnitCostKes : actualUnitCostKes,
            actualQuantity: input.actualQuantity === undefined ? line.actualQuantity : actualQuantity,
            note: input.note === undefined ? line.note : input.note?.trim() || null,
          },
    );

    await shoppingRunRepository.replaceLines(runId, lines, totalActual(lines), actor);
    return { ...run, lines, actualTotalKes: totalActual(lines) };
  }

  /**
   * Closes a run.
   *
   * Deliberately allowed with lines still unticked. A shop runs out of
   * things, and a run that could only be closed once every line was
   * bought would either stay open forever or push someone into ticking
   * a line they did not buy — which is worse, because the whole point
   * of the actuals is that they are true.
   */
  async completeRun(businessId: string, runId: string, actor: string): Promise<void> {
    const run = await this.getRun(businessId, runId);
    if (run.status === 'completed') {
      return;
    }
    await shoppingRunRepository.markCompleted(runId, actor);
  }

  async reopenRun(businessId: string, runId: string, actor: string): Promise<void> {
    await this.getRun(businessId, runId);
    await shoppingRunRepository.reopen(runId, actor);
  }

  async updateNotes(businessId: string, runId: string, notes: string, actor: string): Promise<void> {
    await this.getRun(businessId, runId);
    await shoppingRunRepository.updateNotes(runId, (notes ?? '').trim(), actor);
  }
}

/** A line only counts toward the real spend once both what was paid and how many were bought are known. */
function totalActual(lines: ShoppingRunLine[]): number {
  return lines.reduce((total, line) => {
    if (line.actualUnitCostKes === null || line.actualQuantity === null) {
      return total;
    }
    return total + line.actualUnitCostKes * line.actualQuantity;
  }, 0);
}

function normalizeMoney(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed);
}

function normalizeCount(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

export const shoppingRunService = new ShoppingRunService();
export { ShoppingRunService };
