import 'server-only';

import { Timestamp, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { ProductPrice, ProductPriceType } from '@/types';

const COLLECTION = 'productPrices';
const CURRENT_COLLECTION = 'productPriceCurrent';

type Catalogue = ProductPrice['productCatalogue'];

/** `productPriceCurrent/{businessId}__{catalogue}__{productId}` — the prices in effect now, kept in step with the history so a sale reads one document. */
export interface ProductPriceCurrent {
  businessId: string;
  productCatalogue: Catalogue;
  productId: string;
  prices: Partial<Record<ProductPriceType, { amountKes: number; priceId: string; effectiveFrom: Timestamp }>>;
  updatedAt: Timestamp;
}

export const currentPriceDocId = (businessId: string, productCatalogue: Catalogue, productId: string) => `${businessId}__${productCatalogue}__${productId}`;

/**
 * `productPrices` and its "current" projection. Only `priceBookService`
 * writes here, always closing the open entry, opening the next and
 * updating the projection in one transaction, so the three can never
 * disagree.
 */
class ProductPriceRepository {
  currentRef(businessId: string, productCatalogue: Catalogue, productId: string) {
    return adminFirestore.collection(CURRENT_COLLECTION).doc(currentPriceDocId(businessId, productCatalogue, productId));
  }

  async getCurrentInTransaction(tx: Transaction, businessId: string, productCatalogue: Catalogue, productId: string): Promise<ProductPriceCurrent | null> {
    const snapshot = await tx.get(this.currentRef(businessId, productCatalogue, productId));
    return snapshot.exists ? (snapshot.data() as ProductPriceCurrent) : null;
  }

  async getCurrent(businessId: string, productCatalogue: Catalogue, productId: string): Promise<ProductPriceCurrent | null> {
    const snapshot = await this.currentRef(businessId, productCatalogue, productId).get();
    return snapshot.exists ? (snapshot.data() as ProductPriceCurrent) : null;
  }

  /** Current prices of many products in one round trip. */
  async getCurrentMany(businessId: string, products: { productCatalogue: Catalogue; productId: string }[]): Promise<Map<string, ProductPriceCurrent>> {
    const result = new Map<string, ProductPriceCurrent>();
    if (products.length === 0) return result;
    const refs = products.map(({ productCatalogue, productId }) => this.currentRef(businessId, productCatalogue, productId));
    for (let index = 0; index < refs.length; index += 300) {
      const snapshots = await adminFirestore.getAll(...refs.slice(index, index + 300));
      for (const snapshot of snapshots) {
        if (snapshot.exists) result.set(snapshot.id, snapshot.data() as ProductPriceCurrent);
      }
    }
    return result;
  }

  newEntryRef() {
    return adminFirestore.collection(COLLECTION).doc();
  }

  entryRef(priceId: string) {
    return adminFirestore.collection(COLLECTION).doc(priceId);
  }

  /** The price of one type in effect at `at`: the latest entry that started on or before it and had not ended. */
  async findInEffectAt(businessId: string, productCatalogue: Catalogue, productId: string, priceType: ProductPriceType, at: Date): Promise<{ id: string; data: ProductPrice } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('productCatalogue', '==', productCatalogue)
      .where('productId', '==', productId)
      .where('priceType', '==', priceType)
      .where('effectiveFrom', '<=', Timestamp.fromDate(at))
      .orderBy('effectiveFrom', 'desc')
      .limit(1)
      .get();
    const doc = snapshot.docs[0];
    if (!doc) return null;
    const data = doc.data() as ProductPrice;
    if (data.effectiveTo && data.effectiveTo.toMillis() <= at.getTime()) return null;
    return { id: doc.id, data };
  }

  /** A product's price history, newest first. */
  async listHistory(businessId: string, productCatalogue: Catalogue, productId: string, limit = 100): Promise<{ id: string; data: ProductPrice }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('productCatalogue', '==', productCatalogue)
      .where('productId', '==', productId)
      .orderBy('effectiveFrom', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as ProductPrice }));
  }
}

export const productPriceRepository = new ProductPriceRepository();
