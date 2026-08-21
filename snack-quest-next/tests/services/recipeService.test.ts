import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { packageRepository } from '@/repositories/packageRepository';
import { boxRecipeRepository } from '@/repositories/boxRecipeRepository';
import { recipeService, RecipeValidationError, SnackItemNotFoundError } from '@/services/recipeService';

const BUSINESS_ID = 'biz-recipe-test';
const ACTOR = 'staff-1';

async function seedBox(name: string, priceKes = 2500): Promise<string> {
  return packageRepository.create(
    {
      businessId: BUSINESS_ID,
      name,
      description: 'A box',
      priceKes,
      isActive: true,
      imageUrl: null,
    },
    ACTOR,
  );
}

async function seedSnack(name: string, expectedUnitCostKes: number, overrides: Record<string, unknown> = {}) {
  return recipeService.createSnackItem(
    BUSINESS_ID,
    {
      name,
      imageUrl: null,
      expectedUnitCostKes,
      unitLabel: 'bag',
      origin: 'Japan',
      sourcingNote: null,
      isActive: true,
      ...overrides,
    },
    ACTOR,
  );
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('snackItems'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('boxRecipes'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('packages'));
});

describe('the snack catalogue', () => {
  it('stores a snack with everything a runner needs to buy it', async () => {
    const id = await seedSnack('Calbee Shrimp Chips 70g', 180, { sourcingNote: 'Chinese shop, Diamond Plaza' });

    expect(await recipeService.getSnackItem(BUSINESS_ID, id)).toMatchObject({
      name: 'Calbee Shrimp Chips 70g',
      expectedUnitCostKes: 180,
      unitLabel: 'bag',
      origin: 'Japan',
      sourcingNote: 'Chinese shop, Diamond Plaza',
      isActive: true,
    });
  });

  it.each([
    ['a blank name', { name: '   ' }],
    ['a negative cost', { expectedUnitCostKes: -5 }],
    ['a non-numeric cost', { expectedUnitCostKes: Number.NaN }],
  ])('refuses %s', async (_label, overrides) => {
    await expect(seedSnack('Pocky', 200, overrides)).rejects.toThrow(RecipeValidationError);
  });

  it('defaults a missing unit label rather than leaving a quantity ambiguous', async () => {
    const id = await seedSnack('Ramune', 250, { unitLabel: '  ' });
    expect((await recipeService.getSnackItem(BUSINESS_ID, id)).unitLabel).toBe('unit');
  });

  it('never returns another business’s snack', async () => {
    const id = await seedSnack('Pocky', 200);
    await expect(recipeService.getSnackItem('some-other-business', id)).rejects.toThrow(SnackItemNotFoundError);
  });

  /**
   * Deleting a snack that recipes still reference would leave those
   * recipes pointing at nothing, which the resolver renders as a gap in
   * a box nobody asked for. `isActive` is the way to retire one.
   */
  it('refuses to delete a snack that is still in a recipe, and names how many', async () => {
    const packageId = await seedBox('Explorer Box');
    const snackId = await seedSnack('Pocky', 200);
    await recipeService.saveRecipe(BUSINESS_ID, packageId, { items: [{ snackItemId: snackId, quantity: 2 }], notes: '' }, ACTOR);

    await expect(recipeService.deleteSnackItem(BUSINESS_ID, snackId)).rejects.toThrow(/still in 1 box recipe/);
  });

  it('deletes a snack nothing references', async () => {
    const snackId = await seedSnack('Pocky', 200);
    await recipeService.deleteSnackItem(BUSINESS_ID, snackId);

    await expect(recipeService.getSnackItem(BUSINESS_ID, snackId)).rejects.toThrow(SnackItemNotFoundError);
  });

  it('can list only active snacks, for the recipe builder', async () => {
    await seedSnack('Pocky', 200);
    await seedSnack('Discontinued Thing', 100, { isActive: false });

    const active = await recipeService.listSnackItems(BUSINESS_ID, { activeOnly: true });
    expect(active.map((entry) => entry.data.name)).toEqual(['Pocky']);
    expect(await recipeService.listSnackItems(BUSINESS_ID)).toHaveLength(2);
  });
});

describe('box recipes', () => {
  it('resolves a recipe into what the box contains and what it costs to fill', async () => {
    const packageId = await seedBox('Explorer Box', 2500);
    const pocky = await seedSnack('Pocky', 200);
    const ramune = await seedSnack('Ramune', 250);

    await recipeService.saveRecipe(
      BUSINESS_ID,
      packageId,
      { items: [{ snackItemId: pocky, quantity: 3 }, { snackItemId: ramune, quantity: 2 }], notes: 'Bubble-wrap the Ramune.' },
      ACTOR,
    );

    const recipe = await recipeService.getRecipe(BUSINESS_ID, packageId);

    expect(recipe?.packageName).toBe('Explorer Box');
    expect(recipe?.notes).toBe('Bubble-wrap the Ramune.');
    expect(recipe?.totalCostKes).toBe(3 * 200 + 2 * 250);
    expect(recipe?.lines.map((line) => [line.item?.name, line.quantity, line.lineCostKes])).toEqual([
      ['Pocky', 3, 600],
      ['Ramune', 2, 500],
    ]);
  });

  it('returns null for a box that has no recipe yet', async () => {
    const packageId = await seedBox('Explorer Box');
    expect(await recipeService.getRecipe(BUSINESS_ID, packageId)).toBeNull();
  });

  /** One snack listed twice is one line with a bigger quantity — a runner should never see the same snack on two lines. */
  it('collapses a snack listed twice instead of duplicating the line', async () => {
    const packageId = await seedBox('Explorer Box');
    const pocky = await seedSnack('Pocky', 200);

    await recipeService.saveRecipe(
      BUSINESS_ID,
      packageId,
      { items: [{ snackItemId: pocky, quantity: 3 }, { snackItemId: pocky, quantity: 4 }], notes: '' },
      ACTOR,
    );

    const recipe = await recipeService.getRecipe(BUSINESS_ID, packageId);
    expect(recipe?.lines).toHaveLength(1);
  });

  it.each([0, -1, 1.5])('refuses a quantity of %s', async (quantity) => {
    const packageId = await seedBox('Explorer Box');
    const pocky = await seedSnack('Pocky', 200);

    await expect(
      recipeService.saveRecipe(BUSINESS_ID, packageId, { items: [{ snackItemId: pocky, quantity }], notes: '' }, ACTOR),
    ).rejects.toThrow(RecipeValidationError);
  });

  it('refuses to save a recipe referencing a snack that does not exist', async () => {
    const packageId = await seedBox('Explorer Box');

    await expect(
      recipeService.saveRecipe(BUSINESS_ID, packageId, { items: [{ snackItemId: 'ghost', quantity: 1 }], notes: '' }, ACTOR),
    ).rejects.toThrow(SnackItemNotFoundError);
  });

  it('refuses to save a recipe against a box that does not exist', async () => {
    await expect(recipeService.saveRecipe(BUSINESS_ID, 'no-such-box', { items: [], notes: '' }, ACTOR)).rejects.toThrow(
      /does not exist/,
    );
  });

  it('replaces items wholesale, so removing a snack really removes it', async () => {
    const packageId = await seedBox('Explorer Box');
    const pocky = await seedSnack('Pocky', 200);
    const ramune = await seedSnack('Ramune', 250);

    await recipeService.saveRecipe(
      BUSINESS_ID,
      packageId,
      { items: [{ snackItemId: pocky, quantity: 1 }, { snackItemId: ramune, quantity: 1 }], notes: '' },
      ACTOR,
    );
    await recipeService.saveRecipe(BUSINESS_ID, packageId, { items: [{ snackItemId: pocky, quantity: 1 }], notes: '' }, ACTOR);

    const recipe = await recipeService.getRecipe(BUSINESS_ID, packageId);
    expect(recipe?.lines.map((line) => line.item?.name)).toEqual(['Pocky']);
  });

  /**
   * A recipe pointing at a snack that has vanished is reported, never
   * silently shortened — a box quietly missing an item is exactly the
   * failure this whole feature exists to prevent.
   */
  it('reports a snack that has vanished from the catalogue rather than dropping the line', async () => {
    const packageId = await seedBox('Explorer Box');
    const pocky = await seedSnack('Pocky', 200);
    await recipeService.saveRecipe(BUSINESS_ID, packageId, { items: [{ snackItemId: pocky, quantity: 3 }], notes: '' }, ACTOR);

    // Deleted straight through the repository, bypassing the service's
    // own in-use guard — the state a race or a manual fix could leave.
    await adminFirestore.collection('snackItems').doc(pocky).delete();

    const recipe = await recipeService.getRecipe(BUSINESS_ID, packageId);
    expect(recipe?.lines).toHaveLength(1);
    expect(recipe?.lines[0].item).toBeNull();
    expect(recipe?.missingItemIds).toEqual([pocky]);
    expect(recipe?.totalCostKes).toBe(0);
  });

  it('never reads another business’s recipe', async () => {
    const packageId = await seedBox('Explorer Box');
    const pocky = await seedSnack('Pocky', 200);
    await recipeService.saveRecipe(BUSINESS_ID, packageId, { items: [{ snackItemId: pocky, quantity: 1 }], notes: '' }, ACTOR);

    expect(await boxRecipeRepository.findByPackageId('some-other-business', packageId)).toBeNull();
  });
});

describe('recipe coverage', () => {
  it('shows which boxes still have no recipe, with the cost of the ones that do', async () => {
    const withRecipe = await seedBox('Explorer Box', 2500);
    await seedBox('Voyager Box', 4500);
    const pocky = await seedSnack('Pocky', 200);
    await recipeService.saveRecipe(BUSINESS_ID, withRecipe, { items: [{ snackItemId: pocky, quantity: 4 }], notes: '' }, ACTOR);

    const coverage = await recipeService.listRecipeCoverage(BUSINESS_ID);
    const byName = new Map(coverage.map((row) => [row.packageName, row]));

    expect(byName.get('Explorer Box')).toMatchObject({ hasRecipe: true, itemCount: 1, totalCostKes: 800, priceKes: 2500 });
    expect(byName.get('Voyager Box')).toMatchObject({ hasRecipe: false, itemCount: 0, totalCostKes: 0 });
  });
});
