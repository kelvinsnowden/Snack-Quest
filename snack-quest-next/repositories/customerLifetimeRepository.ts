import 'server-only';

import { AggregateField, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { CustomerLifetime } from '@/types';

const COLLECTION = 'customerLifetime';

/**
 * `customerLifetime` reads/writes (§ analytics rollups). Persistence
 * only — `AnalyticsRollupService` owns what a lifetime actually is.
 *
 * The point of this collection is that the metrics built on it are
 * *aggregations* rather than scans: counting the customers acquired in
 * a month, or averaging lifetime revenue, is one aggregation query
 * against an index, not a page-by-page walk of every order the
 * business has ever taken. That is what makes these metrics correct at
 * any dataset size instead of correct below some limit.
 */
class CustomerLifetimeRepository {
  /** `{businessId}__{phoneNumber}` — one document per customer, so a rebuild overwrites rather than accumulates. */
  private docId(businessId: string, phoneNumber: string): string {
    return `${businessId}__${phoneNumber}`;
  }

  async listByBusiness(businessId: string): Promise<CustomerLifetime[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .get();
    return snapshot.docs.map((doc) => doc.data() as CustomerLifetime);
  }

  /**
   * Customers whose *first* order fell inside a window. The CAC
   * numerator's denominator, and a `count()` rather than a read: the
   * metric needs how many, not which.
   */
  async countAcquiredInRange(businessId: string, since: Date, until: Date): Promise<number> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('firstOrderAt', '>=', since)
      .where('firstOrderAt', '<', until)
      .count()
      .get();
    return snapshot.data().count;
  }

  /** The same window, but the documents — for the per-channel split, which needs each one's first channel. */
  async listAcquiredInRange(
    businessId: string,
    since: Date,
    until: Date,
  ): Promise<CustomerLifetime[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('firstOrderAt', '>=', since)
      .where('firstOrderAt', '<', until)
      .get();
    return snapshot.docs.map((doc) => doc.data() as CustomerLifetime);
  }

  /**
   * Lifetime value across every customer, as one aggregation.
   *
   * `sum` and `average` are computed by Firestore over the index — the
   * documents are never sent, so this costs the same whether the
   * business has thirty customers or three hundred thousand. That is
   * the whole reason this collection exists.
   */
  async aggregateLifetime(
    businessId: string,
  ): Promise<{ customerCount: number; totalRevenueKes: number }> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .aggregate({
        customerCount: AggregateField.count(),
        totalRevenueKes: AggregateField.sum('totalRevenueKes'),
      })
      .get();

    const data = snapshot.data();
    return {
      customerCount: data.customerCount ?? 0,
      totalRevenueKes: Math.round(data.totalRevenueKes ?? 0),
    };
  }

  /**
   * Replace this business's rollup wholesale.
   *
   * Deletes first, then writes, so a customer whose orders were all
   * cancelled or refunded disappears rather than lingering with stale
   * totals. A partial rebuild that only upserts would leave exactly
   * that ghost, and a ghost customer inflates the denominator of every
   * per-customer metric on the page.
   */
  async replaceAll(businessId: string, customers: CustomerLifetime[]): Promise<void> {
    const existing = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .get();

    const writer = adminFirestore.bulkWriter();
    const keep = new Set(customers.map((c) => this.docId(businessId, c.phoneNumber)));
    for (const doc of existing.docs) {
      if (!keep.has(doc.id)) {
        writer.delete(doc.ref);
      }
    }
    const rebuiltAt = Timestamp.now();
    for (const customer of customers) {
      writer.set(
        adminFirestore.collection(COLLECTION).doc(this.docId(businessId, customer.phoneNumber)),
        { ...customer, rebuiltAt },
      );
    }
    await writer.close();
  }
}

export const customerLifetimeRepository = new CustomerLifetimeRepository();
