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
}

export const pageViewRepository = new PageViewRepository();
