import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { recipeService, RecipeValidationError } from '@/services/recipeService';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { parseSnackItemBody } from '@/lib/recipes/parseSnackItemBody';

/** Brand, barcode, allergens and net content on a snack (§ PRODUCT DATA MODEL), through the same parser the API uses. */

const BUSINESS_ID = 'biz-snack-details';

beforeEach(async () => {
  const snapshot = await adminFirestore.collection('snackItems').where('businessId', '==', BUSINESS_ID).get();
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
});

function draft(body: Record<string, unknown>) {
  const parsed = parseSnackItemBody({ name: 'Calbee Shrimp Chips 70g', unitLabel: 'bag', ...body });
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed.draft;
}

describe('snack details', () => {
  it('stores what the pack says, leaves fields alone when an update omits them, and clears with null', async () => {
    const id = await recipeService.createSnackItem(BUSINESS_ID, draft({ brand: 'Calbee', barcode: '4006381333931', allergens: ['crustaceans', 'gluten'], netContent: { amount: 70, unit: 'g' } }), 'staff-1');
    expect(await snackItemRepository.findById(id)).toMatchObject({ brand: 'Calbee', barcode: '4006381333931', allergens: ['gluten', 'crustaceans'], netContent: { amount: 70, unit: 'g' } });

    await recipeService.updateSnackItem(BUSINESS_ID, id, draft({ origin: 'Japan' }), 'staff-1');
    expect(await snackItemRepository.findById(id)).toMatchObject({ brand: 'Calbee', barcode: '4006381333931', allergens: ['gluten', 'crustaceans'] });

    await recipeService.updateSnackItem(BUSINESS_ID, id, draft({ allergens: [], barcode: null }), 'staff-1');
    const after = await snackItemRepository.findById(id);
    expect(after?.allergens).toEqual([]);
    expect(after?.barcode).toBeNull();
  });

  it('refuses a barcode another snack already has, but lets a snack keep its own', async () => {
    const first = await recipeService.createSnackItem(BUSINESS_ID, draft({ barcode: '036000291452' }), 'staff-1');
    await expect(recipeService.createSnackItem(BUSINESS_ID, draft({ name: 'Another snack', barcode: '036000291452' }), 'staff-1')).rejects.toBeInstanceOf(RecipeValidationError);
    await expect(recipeService.updateSnackItem(BUSINESS_ID, first, draft({ barcode: '036000291452' }), 'staff-1')).resolves.toBeUndefined();
  });

  it('the API parser refuses a mistyped barcode', () => {
    expect(parseSnackItemBody({ name: 'x', barcode: '036000291453' })).toEqual({ error: expect.stringMatching(/barcode/) });
  });
});
