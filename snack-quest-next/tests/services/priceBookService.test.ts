import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { priceBookService, PriceBookValidationError, PriceBookProductNotFoundError } from '@/services/priceBookService';
import { snackItemRepository } from '@/repositories/snackItemRepository';

/**
 * The price book (§ PRICE HISTORY): three price types per product, each
 * with a history that is never rewritten, and a "current" projection that
 * always agrees with it.
 */

const BUSINESS_ID = 'biz-price-book';

beforeEach(async () => {
  for (const collection of ['productPrices', 'productPriceCurrent', 'snackItems', 'packages']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
});

async function snack(cost = 180, extra: Record<string, unknown> = {}) {
  return snackItemRepository.create({ businessId: BUSINESS_ID, name: 'Pocky', imageUrl: null, expectedUnitCostKes: cost, unitLabel: 'box', origin: 'Japan', sourcingNote: null, isActive: true, ...extra }, 'staff-1');
}

const set = (productId: string, priceType: 'landed_cost' | 'owner_wholesale' | 'retail_list', amountKes: number, reason = 'supplier price change') =>
  priceBookService.setPrice({ businessId: BUSINESS_ID, productCatalogue: 'snackItem', productId, priceType, amountKes, reason, actor: 'staff-1' });

describe('priceBookService', () => {
  it('keeps the three layers apart: landed 180, owner 250, retail 350', async () => {
    const id = await snack(180);
    await set(id, 'owner_wholesale', 250);
    await set(id, 'retail_list', 350);
    expect(await priceBookService.currentPrices(BUSINESS_ID, 'snackItem', id)).toEqual({ landedCostKes: 180, ownerWholesaleKes: 250, retailListKes: 350 });
  });

  it('a new price closes the old one; the history keeps both, newest first', async () => {
    const id = await snack(180);
    await set(id, 'landed_cost', 180, 'first recorded');
    await set(id, 'landed_cost', 220, 'supplier raised prices');
    const history = await priceBookService.history(BUSINESS_ID, 'snackItem', id);
    expect(history.map(({ data }) => data.amountKes)).toEqual([220, 180]);
    expect(history[0].data.effectiveTo).toBeNull();
    expect(history[1].data.effectiveTo).not.toBeNull();
    expect((await priceBookService.currentPrices(BUSINESS_ID, 'snackItem', id)).landedCostKes).toBe(220);
  });

  it('a landed-cost change updates the snack’s own cost field too, so older readers stay correct', async () => {
    const id = await snack(180);
    await set(id, 'landed_cost', 220);
    expect((await snackItemRepository.findById(id))?.expectedUnitCostKes).toBe(220);
  });

  it('the price at a past moment is the one in effect then', async () => {
    const id = await snack(180);
    await set(id, 'owner_wholesale', 250);
    const between = new Date();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await set(id, 'owner_wholesale', 270);
    expect(await priceBookService.priceAt(BUSINESS_ID, 'snackItem', id, 'owner_wholesale', between)).toBe(250);
    expect(await priceBookService.priceAt(BUSINESS_ID, 'snackItem', id, 'owner_wholesale', new Date())).toBe(270);
    expect(await priceBookService.priceAt(BUSINESS_ID, 'snackItem', id, 'owner_wholesale', new Date(Date.now() - 86_400_000))).toBeNull();
  });

  it('a price never set is unknown (null), never zero', async () => {
    const id = await snack(180);
    expect(await priceBookService.currentPrices(BUSINESS_ID, 'snackItem', id)).toMatchObject({ ownerWholesaleKes: null, retailListKes: null });
  });

  it('a snack created without a cost has no landed cost until someone sets one', async () => {
    const id = await snack(0, { costPending: true });
    expect((await priceBookService.currentPrices(BUSINESS_ID, 'snackItem', id)).landedCostKes).toBeNull();
    await set(id, 'landed_cost', 150);
    expect((await priceBookService.currentPrices(BUSINESS_ID, 'snackItem', id)).landedCostKes).toBe(150);
    expect((await snackItemRepository.findById(id))?.costPending).toBe(false);
  });

  it('refuses a fraction, a negative, a missing reason and an unknown product', async () => {
    const id = await snack(180);
    await expect(set(id, 'retail_list', 12.5)).rejects.toBeInstanceOf(PriceBookValidationError);
    await expect(set(id, 'retail_list', -1)).rejects.toBeInstanceOf(PriceBookValidationError);
    await expect(set(id, 'retail_list', 300, ' ')).rejects.toBeInstanceOf(PriceBookValidationError);
    await expect(set('no-such-snack', 'retail_list', 300)).rejects.toBeInstanceOf(PriceBookProductNotFoundError);
  });

  it('two changes at once leave exactly one open price and a consistent projection', async () => {
    const id = await snack(180);
    await Promise.all([set(id, 'owner_wholesale', 250, 'change A'), set(id, 'owner_wholesale', 260, 'change B')]);
    const history = await priceBookService.history(BUSINESS_ID, 'snackItem', id);
    const open = history.filter(({ data }) => data.priceType === 'owner_wholesale' && data.effectiveTo === null);
    expect(open).toHaveLength(1);
    expect((await priceBookService.currentPrices(BUSINESS_ID, 'snackItem', id)).ownerWholesaleKes).toBe(open[0].data.amountKes);
  });

  it('currentPricesMany reads many products at once', async () => {
    const a = await snack(100);
    const b = await snack(200);
    await set(b, 'owner_wholesale', 260);
    const prices = await priceBookService.currentPricesMany(BUSINESS_ID, [
      { productCatalogue: 'snackItem', productId: a },
      { productCatalogue: 'snackItem', productId: b },
    ]);
    expect(prices.get(`snackItem__${a}`)).toMatchObject({ landedCostKes: 100, ownerWholesaleKes: null });
    expect(prices.get(`snackItem__${b}`)).toMatchObject({ landedCostKes: 200, ownerWholesaleKes: 260 });
  });
});
