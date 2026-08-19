import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { AuditFields, Review, ReviewStatus } from '@/types';

const COLLECTION = 'reviews';

export type ReviewInput = Omit<Review, keyof AuditFields | 'moderatedBy' | 'moderatedAt'>;

class ReviewRepository {
  async create(input: ReviewInput): Promise<string> {
    const now = FieldValue.serverTimestamp();
    const ref = await adminFirestore.collection(COLLECTION).add({
      ...input,
      moderatedBy: null,
      moderatedAt: null,
      createdAt: now,
      updatedAt: now,
      // A public submission has no authenticated author to attribute
      // the write to; the reviewer's own name is on the document.
      createdBy: 'public',
      updatedBy: 'public',
      deletedAt: null,
    });
    return ref.id;
  }

  async findById(businessId: string, reviewId: string): Promise<Review | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(reviewId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as Review;
    return data.businessId === businessId ? data : null;
  }

  /**
   * Newest first. `status` is always supplied by the caller — there is
   * no "all reviews" read on the public path, so the published filter
   * can never be forgotten at a call site.
   *
   * Needs a composite index (businessId + status + createdAt) — see
   * firestore.indexes.json.
   */
  async listByStatus(
    businessId: string,
    status: ReviewStatus,
    options: { limit?: number } = {},
  ): Promise<{ id: string; data: Review }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('status', '==', status)
      .orderBy('createdAt', 'desc')
      .limit(options.limit ?? 50)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as Review }));
  }

  async countByStatus(businessId: string, status: ReviewStatus): Promise<number> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('status', '==', status)
      .count()
      .get();
    return snapshot.data().count;
  }

  /**
   * How many reviews of each status carry each star rating, 1 through
   * 5 — the rating histogram on `/reviews`. Five aggregation `.count()`
   * queries rather than fetching every document: Firestore has no
   * `GROUP BY`, and reading every review just to tally ratings would
   * cost far more once there are more than a handful, and would only
   * grow worse over time.
   */
  async countByStatusPerRating(businessId: string, status: ReviewStatus): Promise<Record<1 | 2 | 3 | 4 | 5, number>> {
    const ratings = [1, 2, 3, 4, 5] as const;
    const counts = await Promise.all(
      ratings.map((rating) =>
        adminFirestore
          .collection(COLLECTION)
          .where('businessId', '==', businessId)
          .where('status', '==', status)
          .where('rating', '==', rating)
          .count()
          .get()
          .then((snapshot) => snapshot.data().count),
      ),
    );
    return { 1: counts[0], 2: counts[1], 3: counts[2], 4: counts[3], 5: counts[4] };
  }

  async setStatus(reviewId: string, status: ReviewStatus, actor: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(reviewId).update({
      status,
      moderatedBy: actor,
      moderatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
  }

  /**
   * How many reviews this phone number has submitted since a given
   * moment — the one signal available to rate-limit an unauthenticated
   * public form without an IP store or a captcha. Only meaningful when
   * a number was given; anonymous submissions fall back to the
   * per-request size limits alone.
   */
  async countRecentByPhone(businessId: string, contactPhone: string, since: Date): Promise<number> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('contactPhone', '==', contactPhone)
      .where('createdAt', '>=', since)
      .count()
      .get();
    return snapshot.data().count;
  }

  /**
   * Every phone number that has already left a review, any status
   * (§ Mission 2 — review acquisition). Backs the "who should we still
   * ask?" queue: one bounded read building a lookup set, rather than a
   * per-candidate existence query each time that list is rendered.
   *
   * Status is deliberately not filtered — someone whose review is
   * still pending, or was rejected, has already been asked once, and
   * asking again is the thing this is meant to prevent.
   */
  async listContactPhones(businessId: string, limit = 500): Promise<string[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .select('contactPhone')
      .limit(limit)
      .get();
    return snapshot.docs
      .map((doc) => (doc.data() as { contactPhone?: string | null }).contactPhone)
      .filter((phone): phone is string => Boolean(phone));
  }
}

export const reviewRepository = new ReviewRepository();
