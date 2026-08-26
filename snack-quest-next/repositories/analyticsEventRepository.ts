import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AnalyticsEvent } from '@/types';

const COLLECTION = 'analyticsEvents';

/** Bounded scan, same discipline as `PageViewRepository`'s own — correct for today's volume. */
const MAX_EVENTS_PER_QUERY = 20000;

export type AnalyticsEventInput = Omit<AnalyticsEvent, 'createdAt'>;

/** `analyticsEvents` reads/writes (§ exit-intent rescue offer) — sibling to `PageViewRepository`, same shape and discipline. */
class AnalyticsEventRepository {
  async create(input: AnalyticsEventInput): Promise<void> {
    await adminFirestore.collection(COLLECTION).add({
      ...input,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  /** Every event of one name for a business since a given moment — the funnel counts a caller builds from this. Needs a composite index (businessId + event + createdAt) — see firestore.indexes.json. */
  async listByEventSince(businessId: string, event: string, since: Date): Promise<AnalyticsEvent[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('event', '==', event)
      .where('createdAt', '>=', since)
      .limit(MAX_EVENTS_PER_QUERY)
      .get();
    return snapshot.docs.map((doc) => doc.data() as AnalyticsEvent);
  }

  /**
   * Everything one browser did, oldest first — the visit that produced
   * an order (§ close the loop: ad-conversion attribution).
   *
   * The aggregate funnel answers "how many people reached checkout".
   * This answers the different and, on a shop with a handful of sales,
   * far more useful question: what did the person who actually bought
   * do on the way there. Needs a composite index
   * (businessId + visitorId + createdAt) — see firestore.indexes.json.
   */
  async listByVisitor(businessId: string, visitorId: string, limit = 200): Promise<AnalyticsEvent[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('visitorId', '==', visitorId)
      .orderBy('createdAt', 'asc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => doc.data() as AnalyticsEvent);
  }
}

export const analyticsEventRepository = new AnalyticsEventRepository();
