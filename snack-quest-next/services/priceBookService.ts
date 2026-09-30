import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { productPriceRepository, currentPriceDocId, type ProductPriceCurrent } from '@/repositories/productPriceRepository';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { PRODUCT_PRICE_TYPES, type ProductPrice, type ProductPriceType } from '@/types';

type Catalogue = ProductPrice['productCatalogue'];

export class PriceBookValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PriceBookValidationError';
  }
}

export class PriceBookProductNotFoundError extends Error {
  constructor(productCatalogue: Catalogue, productId: string) {
    super(`No ${productCatalogue === 'snackItem' ? 'snack' : 'box'} with id "${productId}".`);
    this.name = 'PriceBookProductNotFoundError';
  }
}

/** A product's prices in effect now. Null means no price of that type has been recorded. */
export interface CurrentPrices {
  landedCostKes: number | null;
  ownerWholesaleKes: number | null;
  retailListKes: number | null;
}

const MAX_PRICE_KES = 10_000_000;

function fromCurrent(current: ProductPriceCurrent | null | undefined, legacyLandedCostKes: number | null): CurrentPrices {
  return {
    // A snack's landed cost recorded before the price book existed lives on the snack itself.
    landedCostKes: current?.prices.landed_cost?.amountKes ?? legacyLandedCostKes,
    ownerWholesaleKes: current?.prices.owner_wholesale?.amountKes ?? null,
    retailListKes: current?.prices.retail_list?.amountKes ?? null,
  };
}

/**
 * The price book (§ PRICE HISTORY, docs/OS_MASTER_GAP_ANALYSIS.md §3.2):
 * Snack Quest's landed cost, the owner wholesale price and the suggested
 * retail price of every product, each with a history that is never
 * rewritten. A machine's actual selling price stays on its slot; what a
 * customer paid is on the sale.
 *
 * A new price takes effect now — never backdated, because a backdated
 * price would silently change what already-settled sales cost.
 */
class PriceBookService {
  async setPrice(input: {
    businessId: string;
    productCatalogue: Catalogue;
    productId: string;
    priceType: ProductPriceType;
    amountKes: number;
    reason: string;
    actor: string;
  }): Promise<{ priceId: string; previousKes: number | null }> {
    if (!(PRODUCT_PRICE_TYPES as readonly string[]).includes(input.priceType)) {
      throw new PriceBookValidationError(`Unknown price type "${input.priceType}".`);
    }
    if (!Number.isInteger(input.amountKes) || input.amountKes < 0 || input.amountKes > MAX_PRICE_KES) {
      throw new PriceBookValidationError('The price must be a whole number of shillings, zero or more.');
    }
    const reason = input.reason.trim();
    if (reason.length < 3 || reason.length > 300) {
      throw new PriceBookValidationError('Say why the price is changing (3–300 characters).');
    }
    await this.assertProductExists(input.businessId, input.productCatalogue, input.productId);

    const snackRef = input.productCatalogue === 'snackItem' ? adminFirestore.collection('snackItems').doc(input.productId) : null;
    return adminFirestore.runTransaction(async (tx) => {
      const current = await productPriceRepository.getCurrentInTransaction(tx, input.businessId, input.productCatalogue, input.productId);
      const snackData = snackRef && input.priceType === 'landed_cost' ? (await tx.get(snackRef)).data() : undefined;
      const legacyLanded = snackData && !snackData.costPending ? ((snackData.expectedUnitCostKes as number | undefined) ?? null) : null;
      const open = current?.prices[input.priceType];
      const now = Timestamp.now();
      if (open) {
        tx.update(productPriceRepository.entryRef(open.priceId), { effectiveTo: now });
      }
      const entryRef = productPriceRepository.newEntryRef();
      tx.set(entryRef, {
        businessId: input.businessId,
        productCatalogue: input.productCatalogue,
        productId: input.productId,
        priceType: input.priceType,
        amountKes: input.amountKes,
        effectiveFrom: now,
        effectiveTo: null,
        reason,
        createdBy: input.actor,
        createdAt: now,
      });
      tx.set(
        productPriceRepository.currentRef(input.businessId, input.productCatalogue, input.productId),
        {
          businessId: input.businessId,
          productCatalogue: input.productCatalogue,
          productId: input.productId,
          prices: { [input.priceType]: { amountKes: input.amountKes, priceId: entryRef.id, effectiveFrom: now } },
          updatedAt: now,
        },
        { merge: true },
      );
      // The snack's own cost field stays the current landed cost, so everything that already reads it keeps working.
      if (snackRef && input.priceType === 'landed_cost') {
        tx.update(snackRef, { expectedUnitCostKes: input.amountKes, costPending: false, updatedAt: FieldValue.serverTimestamp(), updatedBy: input.actor });
      }
      return { priceId: entryRef.id, previousKes: open?.amountKes ?? legacyLanded };
    });
  }

  async currentPrices(businessId: string, productCatalogue: Catalogue, productId: string): Promise<CurrentPrices> {
    const [current, legacy] = await Promise.all([
      productPriceRepository.getCurrent(businessId, productCatalogue, productId),
      productCatalogue === 'snackItem' ? snackItemRepository.findById(productId) : Promise.resolve(null),
    ]);
    return fromCurrent(current, legacy && legacy.businessId === businessId && !legacy.costPending ? legacy.expectedUnitCostKes : null);
  }

  /** Current prices of many products, keyed `${catalogue}__${productId}`. */
  async currentPricesMany(businessId: string, products: { productCatalogue: Catalogue; productId: string }[]): Promise<Map<string, CurrentPrices>> {
    const unique = [...new Map(products.map((product) => [`${product.productCatalogue}__${product.productId}`, product])).values()];
    const snackIds = unique.filter((product) => product.productCatalogue === 'snackItem').map((product) => product.productId);
    const [current, snacks] = await Promise.all([productPriceRepository.getCurrentMany(businessId, unique), snackItemRepository.findManyById(snackIds)]);
    const result = new Map<string, CurrentPrices>();
    for (const product of unique) {
      const snack = product.productCatalogue === 'snackItem' ? snacks.get(product.productId) : undefined;
      result.set(
        `${product.productCatalogue}__${product.productId}`,
        fromCurrent(current.get(currentPriceDocId(businessId, product.productCatalogue, product.productId)), snack && snack.businessId === businessId && !snack.costPending ? snack.expectedUnitCostKes : null),
      );
    }
    return result;
  }

  /** The price of one type that was in effect at a moment in the past. */
  async priceAt(businessId: string, productCatalogue: Catalogue, productId: string, priceType: ProductPriceType, at: Date): Promise<number | null> {
    const found = await productPriceRepository.findInEffectAt(businessId, productCatalogue, productId, priceType, at);
    return found?.data.amountKes ?? null;
  }

  async history(businessId: string, productCatalogue: Catalogue, productId: string) {
    return productPriceRepository.listHistory(businessId, productCatalogue, productId);
  }

  private async assertProductExists(businessId: string, productCatalogue: Catalogue, productId: string): Promise<void> {
    if (productCatalogue === 'snackItem') {
      const item = await snackItemRepository.findById(productId);
      if (!item || item.businessId !== businessId) throw new PriceBookProductNotFoundError(productCatalogue, productId);
      return;
    }
    const pkg = await packageRepository.findById(businessId, productId);
    if (!pkg) throw new PriceBookProductNotFoundError(productCatalogue, productId);
  }
}

export const priceBookService = new PriceBookService();
