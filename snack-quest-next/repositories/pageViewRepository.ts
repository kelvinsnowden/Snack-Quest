import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { PageView } from '@/types';

const COLLECTION = 'pageViews';

/**
 * Bounded scan over a recent window, same discipline as
 * `businessAnalyticsService`'s own scans — correct for today's
 * traffic volume, and the honest fix if that changes is a real
 * read-model, not a bigger limit here.
 */
const MAX_PAGE_VIEWS_PER_QUERY = 20000;

export type PageViewInput = Omit<PageView, 'createdAt'>;

class PageViewRepository {
  async create(input: PageViewInput): Promise<void> {
    await adminFirestore.collection(COLLECTION).add({
      ...input,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  /**
   * Every page view for a business since a given moment, unordered —
   * the caller buckets and counts, so there is no sort to pay for here.
   * Needs a composite index (businessId + createdAt) — see
   * firestore.indexes.json.
   */
  async listSince(businessId: string, since: Date): Promise<PageView[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('createdAt', '>=', since)
      .limit(MAX_PAGE_VIEWS_PER_QUERY)
      .get();
    return snapshot.docs.map((doc) => doc.data() as PageView);
  }

  /**
   * Same as `listSince`, bounded above too — backs the admin Analytics
   * day/week/month/custom-range traffic filter, where the window
   * doesn't necessarily end "now". Both clauses are range filters on
   * the same `createdAt` field, so this needs no index beyond the
   * existing businessId + createdAt composite.
   *
   * @deprecated Same truncation as `listSince`. Read `trafficDaily`
   * rollups instead; this remains only for the current day, whose
   * volume is one day's traffic rather than sixty.
   */
  async listInRange(businessId: string, start: Date, end: Date): Promise<PageView[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('createdAt', '>=', start)
      .where('createdAt', '<', end)
      .limit(MAX_PAGE_VIEWS_PER_QUERY)
      .get();
    return snapshot.docs.map((doc) => doc.data() as PageView);
  }

  /**
   * Every page view in a window, cursor-paged and ordered
   * (§ analytics rollups).
   *
   * This is what `listSince` should always have been. That method caps
   * at 20,000 with no `orderBy`, so once a window matches more rows
   * than the cap — which the last thirty days already did, at 21,426 —
   * Firestore returns an arbitrary subset and the caller has no way to
   * know. Ordering by `createdAt` makes the cursor meaningful, and
   * paging until the window is exhausted removes the cap entirely, so
   * a rollup built from this counts every view rather than most of
   * them.
   */
  async *streamRange(
    businessId: string,
    start: Date,
    end: Date,
    options: { pageSize?: number } = {},
  ): AsyncGenerator<PageView> {
    const pageSize = options.pageSize ?? 2000;
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;

    for (;;) {
      let query = adminFirestore
        .collection(COLLECTION)
        .where('businessId', '==', businessId)
        .where('createdAt', '>=', start)
        .where('createdAt', '<', end)
        .orderBy('createdAt', 'asc')
        .limit(pageSize) as FirebaseFirestore.Query;

      if (cursor) {
        query = query.startAfter(cursor);
      }

      const snapshot = await query.get();
      if (snapshot.empty) {
        return;
      }
      for (const doc of snapshot.docs) {
        yield doc.data() as PageView;
      }
      if (snapshot.size < pageSize) {
        return;
      }
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }
  }
}

export const pageViewRepository = new PageViewRepository();
