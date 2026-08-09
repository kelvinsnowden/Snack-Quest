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
}

export const reviewRepository = new ReviewRepository();
