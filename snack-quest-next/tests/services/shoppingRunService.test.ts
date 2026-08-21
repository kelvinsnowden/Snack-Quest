import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { packageRepository } from '@/repositories/packageRepository';
import { recipeService } from '@/services/recipeService';
import {
  shoppingRunService,
  ShoppingRunValidationError,
  ShoppingRunNotFoundError,
} from '@/services/shoppingRunService';

const BUSINESS_ID = 'biz-shopping-run-test';
const ACTOR = 'runner-1';

let orderSeq = 0;

async function seedBox(name: string): Promise<string> {
  return packageRepository.create(
    { businessId: BUSINESS_ID, name, description: 'A box', priceKes: 2500, isActive: true, imageUrl: null },
    ACTOR,
  );
}

async function seedSnack(name: string, expectedUnitCostKes: number) {
  return recipeService.createSnackItem(
    BUSINESS_ID,
    { name, imageUrl: null, expectedUnitCostKes, unitLabel: 'bag', origin: 'Japan', sourcingNote: null, isActive: true },
    ACTOR,
  );
}

/** `items` mirrors the real subcollection an order carries; omit it to model an order that predates it. */
async function seedOrder(packageId: string, items: { packageId: string; quantity: number }[] | null = [{ packageId: '', quantity: 1 }]) {
  orderSeq += 1;
  const orderId = `order-${orderSeq}`;
  await adminFirestore
    .collection('orders')
    .doc(orderId)
    .set({
      businessId: BUSINESS_ID,
      product: { packageId, packageLabel: 'Box' },
      customer: { customerId: null, phoneNumber: '254700000001', customerName: 'Amina', county: 'Nairobi' },
      delivery: { method: 'pickup' },
      payment: { paymentIntentId: `intent-${orderSeq}`, mpesaReceiptNumber: null },
      pricing: { subtotalKes: 2500, discountKes: 0, deliveryFeeKes: 0, creditsUsedKes: 0, totalKes: 2500 },
      conversationId: `conv-${orderSeq}`,
      conversationCheckoutSnapshotId: `snap-${orderSeq}`,
      status: 'confirmed',
      referralLinkId: null,
      attribution: null,
      fulfillmentBatchId: null,
      fulfillment: null,
      packingRecipeVersionId: null,
      packing: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: 'system',
      updatedBy: 'system',
      deletedAt: null,
    });

  if (items) {
    for (const item of items) {
      await adminFirestore
        .collection('orders')
        .doc(orderId)
        .collection('items')
        .add({
          packageId: item.packageId || packageId,
          packageLabel: 'Box',
          quantity: item.quantity,
          unitCostKes: 2500,
        });
    }
  }
  return orderId;
}

beforeEach(async () => {
  orderSeq = 0;
  await adminFirestore.recursiveDelete(adminFirestore.collection('snackItems'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('boxRecipes'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('packages'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('orders'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('shoppingRuns'));
});

describe('building a shopping run', () => {
  /** The whole point: a runner should read a total, not compute one at a market stall. */
  it('adds the same snack up across several orders into one line', async () => {
    const box = await seedBox('Explorer Box');
    const pocky = await seedSnack('Pocky', 200);
    await recipeService.saveRecipe(BUSINESS_ID, box, { items: [{ snackItemId: pocky, quantity: 3 }], notes: '' }, ACTOR);

    const orders = [await seedOrder(box), await seedOrder(box), await seedOrder(box)];
    const runId = await shoppingRunService.createRun(BUSINESS_ID, orders, ACTOR);

    const run = await shoppingRunService.getRun(BUSINESS_ID, runId);
    expect(run.lines).toHaveLength(1);
    expect(run.lines[0]).toMatchObject({ nameSnapshot: 'Pocky', quantityNeeded: 9, expectedUnitCostKes: 200 });
    expect(run.expectedTotalKes).toBe(9 * 200);
    expect(run.orderCount).toBe(3);
  });

  it('combines different boxes that share a snack', async () => {
    const explorer = await seedBox('Explorer Box');
    const voyager = await seedBox('Voyager Box');
    const pocky = await seedSnack('Pocky', 200);
    const ramune = await seedSnack('Ramune', 250);

    await recipeService.saveRecipe(BUSINESS_ID, explorer, { items: [{ snackItemId: pocky, quantity: 2 }], notes: '' }, ACTOR);
    await recipeService.saveRecipe(
      BUSINESS_ID,
      voyager,
      { items: [{ snackItemId: pocky, quantity: 5 }, { snackItemId: ramune, quantity: 1 }], notes: '' },
      ACTOR,
    );

    const runId = await shoppingRunService.createRun(BUSINESS_ID, [await seedOrder(explorer), await seedOrder(voyager)], ACTOR);
    const run = await shoppingRunService.getRun(BUSINESS_ID, runId);

    const byName = new Map(run.lines.map((line) => [line.nameSnapshot, line.quantityNeeded]));
    expect(byName.get('Pocky')).toBe(7);
    expect(byName.get('Ramune')).toBe(1);
  });

  /** An order can be for more than one box; buying half of what a customer paid for is only discovered at packing time. */
  it('respects an order for more than one box', async () => {
    const box = await seedBox('Explorer Box');
    const pocky = await seedSnack('Pocky', 200);
    await recipeService.saveRecipe(BUSINESS_ID, box, { items: [{ snackItemId: pocky, quantity: 3 }], notes: '' }, ACTOR);

    const runId = await shoppingRunService.createRun(BUSINESS_ID, [await seedOrder(box, [{ packageId: box, quantity: 4 }])], ACTOR);

    expect((await shoppingRunService.getRun(BUSINESS_ID, runId)).lines[0].quantityNeeded).toBe(12);
  });

  /** An order with no items subcollection still represents one real box — counting it as zero would silently under-buy. */
  it('counts an order with no items subcollection as one box', async () => {
    const box = await seedBox('Explorer Box');
    const pocky = await seedSnack('Pocky', 200);
    await recipeService.saveRecipe(BUSINESS_ID, box, { items: [{ snackItemId: pocky, quantity: 3 }], notes: '' }, ACTOR);

    const runId = await shoppingRunService.createRun(BUSINESS_ID, [await seedOrder(box, null)], ACTOR);

    expect((await shoppingRunService.getRun(BUSINESS_ID, runId)).lines[0].quantityNeeded).toBe(3);
  });

  /** A run that quietly under-buys because a box was never given a recipe is worse than one that says so. */
  it('names boxes with no recipe rather than skipping them in silence', async () => {
    const withRecipe = await seedBox('Explorer Box');
    const withoutRecipe = await seedBox('Voyager Box');
    const pocky = await seedSnack('Pocky', 200);
    await recipeService.saveRecipe(BUSINESS_ID, withRecipe, { items: [{ snackItemId: pocky, quantity: 1 }], notes: '' }, ACTOR);

    const runId = await shoppingRunService.createRun(
      BUSINESS_ID,
      [await seedOrder(withRecipe), await seedOrder(withoutRecipe)],
      ACTOR,
    );

    expect((await shoppingRunService.getRun(BUSINESS_ID, runId)).missingRecipePackageIds).toEqual([withoutRecipe]);
  });

  it('refuses to build a run when no box in it has a recipe', async () => {
    const box = await seedBox('Explorer Box');
    await expect(shoppingRunService.createRun(BUSINESS_ID, [await seedOrder(box)], ACTOR)).rejects.toThrow(
      /box recipe yet/,
    );
  });

  it('refuses an empty order list', async () => {
    await expect(shoppingRunService.createRun(BUSINESS_ID, [], ACTOR)).rejects.toThrow(ShoppingRunValidationError);
  });

  it('ignores another business’s orders', async () => {
    const box = await seedBox('Explorer Box');
    const pocky = await seedSnack('Pocky', 200);
    await recipeService.saveRecipe(BUSINESS_ID, box, { items: [{ snackItemId: pocky, quantity: 1 }], notes: '' }, ACTOR);
    const orderId = await seedOrder(box);

    await expect(shoppingRunService.createRun('some-other-business', [orderId], ACTOR)).rejects.toThrow(
      /could be found/,
    );
  });

  /**
   * The list must not change under someone who is out shopping against
   * it, so the catalogue is copied at creation and never re-read.
   */
  it('snapshots name and price, so a catalogue edit mid-shop cannot change the list in hand', async () => {
    const box = await seedBox('Explorer Box');
    const pocky = await seedSnack('Pocky', 200);
    await recipeService.saveRecipe(BUSINESS_ID, box, { items: [{ snackItemId: pocky, quantity: 2 }], notes: '' }, ACTOR);
    const runId = await shoppingRunService.createRun(BUSINESS_ID, [await seedOrder(box)], ACTOR);

    await recipeService.updateSnackItem(
      BUSINESS_ID,
      pocky,
      { name: 'Pocky (renamed)', imageUrl: null, expectedUnitCostKes: 999, unitLabel: 'bag', origin: null, sourcingNote: null, isActive: true },
      ACTOR,
    );

    const run = await shoppingRunService.getRun(BUSINESS_ID, runId);
    expect(run.lines[0].nameSnapshot).toBe('Pocky');
    expect(run.lines[0].expectedUnitCostKes).toBe(200);
  });
});

describe('recording what was actually bought', () => {
  async function openRun() {
    const box = await seedBox('Explorer Box');
    const pocky = await seedSnack('Pocky', 200);
    const ramune = await seedSnack('Ramune', 250);
    await recipeService.saveRecipe(
      BUSINESS_ID,
      box,
      { items: [{ snackItemId: pocky, quantity: 2 }, { snackItemId: ramune, quantity: 1 }], notes: '' },
      ACTOR,
    );
    const runId = await shoppingRunService.createRun(BUSINESS_ID, [await seedOrder(box)], ACTOR);
    return { runId, pocky, ramune };
  }

  it('records a real price and quantity, and totals the real spend', async () => {
    const { runId, pocky } = await openRun();

    const run = await shoppingRunService.recordLine(
      BUSINESS_ID,
      runId,
      { snackItemId: pocky, purchased: true, actualUnitCostKes: 220, actualQuantity: 2 },
      ACTOR,
    );

    expect(run.lines.find((line) => line.snackItemId === pocky)).toMatchObject({
      purchased: true,
      actualUnitCostKes: 220,
      actualQuantity: 2,
    });
    expect(run.actualTotalKes).toBe(440);
  });

  /** Ticking a line off at the shelf and pricing it at the till are separate moments; the second must not wipe the first. */
  it('leaves fields alone that the caller did not send', async () => {
    const { runId, pocky } = await openRun();

    await shoppingRunService.recordLine(BUSINESS_ID, runId, { snackItemId: pocky, purchased: true }, ACTOR);
    const run = await shoppingRunService.recordLine(BUSINESS_ID, runId, { snackItemId: pocky, actualUnitCostKes: 220 }, ACTOR);

    const line = run.lines.find((entry) => entry.snackItemId === pocky);
    expect(line).toMatchObject({ purchased: true, actualUnitCostKes: 220 });
  });

  /** "Not yet recorded" and "cost exactly what we expected" are different facts, so a half-recorded line contributes nothing. */
  it('counts a line toward the real spend only once both price and quantity are known', async () => {
    const { runId, pocky } = await openRun();

    const priceOnly = await shoppingRunService.recordLine(BUSINESS_ID, runId, { snackItemId: pocky, actualUnitCostKes: 220 }, ACTOR);
    expect(priceOnly.actualTotalKes).toBe(0);

    const both = await shoppingRunService.recordLine(BUSINESS_ID, runId, { snackItemId: pocky, actualQuantity: 2 }, ACTOR);
    expect(both.actualTotalKes).toBe(440);
  });

  it('handles a shop running short — fewer bought than needed', async () => {
    const { runId, pocky } = await openRun();

    const run = await shoppingRunService.recordLine(
      BUSINESS_ID,
      runId,
      { snackItemId: pocky, purchased: true, actualUnitCostKes: 200, actualQuantity: 1, note: 'Only 1 left' },
      ACTOR,
    );

    const line = run.lines.find((entry) => entry.snackItemId === pocky);
    expect(line).toMatchObject({ quantityNeeded: 2, actualQuantity: 1, note: 'Only 1 left' });
    expect(run.actualTotalKes).toBe(200);
  });

  it('refuses a snack that is not on the run', async () => {
    const { runId } = await openRun();
    await expect(
      shoppingRunService.recordLine(BUSINESS_ID, runId, { snackItemId: 'not-on-this-run' }, ACTOR),
    ).rejects.toThrow(/not on this run/);
  });

  it('refuses to change a closed run until it is reopened', async () => {
    const { runId, pocky } = await openRun();
    await shoppingRunService.completeRun(BUSINESS_ID, runId, ACTOR);

    await expect(
      shoppingRunService.recordLine(BUSINESS_ID, runId, { snackItemId: pocky, purchased: true }, ACTOR),
    ).rejects.toThrow(/closed/);

    await shoppingRunService.reopenRun(BUSINESS_ID, runId, ACTOR);
    await expect(
      shoppingRunService.recordLine(BUSINESS_ID, runId, { snackItemId: pocky, purchased: true }, ACTOR),
    ).resolves.toBeTruthy();
  });

  /** A shop runs out of things. Forcing every line to be ticked would push someone into ticking one they did not buy. */
  it('closes a run with lines still unbought', async () => {
    const { runId } = await openRun();

    await shoppingRunService.completeRun(BUSINESS_ID, runId, ACTOR);

    const run = await shoppingRunService.getRun(BUSINESS_ID, runId);
    expect(run.status).toBe('completed');
    expect(run.completedBy).toBe(ACTOR);
    expect(run.lines.every((line) => !line.purchased)).toBe(true);
  });

  it('never reaches another business’s run', async () => {
    const { runId } = await openRun();
    await expect(shoppingRunService.getRun('some-other-business', runId)).rejects.toThrow(ShoppingRunNotFoundError);
  });
});
