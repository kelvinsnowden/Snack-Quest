import 'server-only';

import { reviewRepository } from '@/repositories/reviewRepository';
import { storageService } from '@/services/storageService';
import { normalizeKenyanPhone } from '@/lib/checkout/phone';
import { publishEvent } from '@/lib/events/eventBus';
import { toMillis } from '@/lib/firestoreTimestamp';
import type { PublicReview, Review, ReviewPhoto, ReviewStatus } from '@/types';

/**
 * Owns customer reviews (§ homepage reviews) — submission through a
 * public link, moderation, and the published set the homepage renders.
 *
 * The design constraint running through all of it: submissions come
 * from unauthenticated strangers and carry photos. So this Service
 * assumes bad input as the normal case rather than the exception —
 * every field is length-bounded, photos go through the same
 * `StorageService` validation (MIME allowlist plus magic-byte check)
 * that staff uploads do, nothing is published on arrival, and a
 * rejected review's photos are actually deleted rather than left
 * sitting in Blob storage forever.
 */

export const MAX_REVIEW_PHOTOS = 3;
export const MAX_REVIEW_BODY_LENGTH = 1200;
export const MAX_REVIEW_NAME_LENGTH = 60;
/** How many reviews one phone number may leave per day, when a number was given at all. */
export const MAX_REVIEWS_PER_PHONE_PER_DAY = 3;

export class ReviewValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewValidationError';
  }
}

export class ReviewNotFoundError extends Error {
  constructor(reviewId: string) {
    super(`Review ${reviewId} not found`);
    this.name = 'ReviewNotFoundError';
  }
}

export interface SubmitReviewInput {
  customerName: string;
  rating: number;
  body: string;
  contactPhone?: string;
  photos: { filename: string; contentType: string; data: Buffer }[];
}

export interface PublishedReviewSummary {
  reviews: PublicReview[];
  /** How many published reviews exist in total, which is not the same as how many are shown. */
  totalCount: number;
  /** Mean rating across published reviews, one decimal place. 0 when there are none — never a fabricated 5. */
  averageRating: number;
}

function toPublicReview(entry: { id: string; data: Review }): PublicReview {
  return {
    id: entry.id,
    customerName: entry.data.customerName,
    rating: entry.data.rating,
    body: entry.data.body,
    // Only the URL crosses to the client — `pathname` is a storage
    // implementation detail that exists for deletion, not display.
    photos: entry.data.photos.map((photo) => ({ url: photo.url })),
    createdAtIso: new Date(toMillis(entry.data.createdAt)).toISOString(),
  };
}

class ReviewService {
  /**
   * Accepts a public submission. Everything is validated before a
   * single byte reaches storage, so a rejected submission can't leave
   * orphaned uploads behind — and photos are uploaded before the
   * document is written, so a stored review always points at images
   * that really exist.
   */
  async submitReview(businessId: string, input: SubmitReviewInput): Promise<{ reviewId: string }> {
    const customerName = input.customerName.trim();
    if (customerName.length < 2) {
      throw new ReviewValidationError('Please tell us your name.');
    }
    if (customerName.length > MAX_REVIEW_NAME_LENGTH) {
      throw new ReviewValidationError('That name is too long.');
    }

    const body = input.body.trim();
    if (body.length < 10) {
      throw new ReviewValidationError('Tell us a little more — at least a sentence.');
    }
    if (body.length > MAX_REVIEW_BODY_LENGTH) {
      throw new ReviewValidationError('That review is a bit long — please shorten it.');
    }

    const rating = Math.trunc(input.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new ReviewValidationError('Please pick a rating from 1 to 5 stars.');
    }

    if (input.photos.length > MAX_REVIEW_PHOTOS) {
      throw new ReviewValidationError(`You can add up to ${MAX_REVIEW_PHOTOS} photos.`);
    }

    // The phone number is optional; when given it's normalized so the
    // per-number rate limit can't be walked around by writing the same
    // number a different way.
    let contactPhone: string | null = null;
    if (input.contactPhone?.trim()) {
      try {
        contactPhone = normalizeKenyanPhone(input.contactPhone);
      } catch {
        throw new ReviewValidationError('That phone number doesn’t look right — or leave it blank.');
      }

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await reviewRepository.countRecentByPhone(businessId, contactPhone, since);
      if (recent >= MAX_REVIEWS_PER_PHONE_PER_DAY) {
        throw new ReviewValidationError(
          'You’ve already left a few reviews today — thank you! Give it a day before the next one.',
        );
      }
    }

    const photos: ReviewPhoto[] = [];
    for (const photo of input.photos) {
      // `StorageService` enforces the `reviews` policy: images only,
      // size-capped, and magic-byte checked against the declared type.
      const uploaded = await storageService.uploadFile({
        businessId,
        directory: 'reviews',
        filename: photo.filename,
        data: photo.data,
        contentType: photo.contentType,
      });
      photos.push({ url: uploaded.url, pathname: uploaded.pathname });
    }

    const reviewId = await reviewRepository.create({
      businessId,
      customerName,
      rating,
      body,
      photos,
      contactPhone,
      // Never published on arrival — see types/review.ts.
      status: 'pending',
    });

    await publishEvent(businessId, 'ReviewSubmitted', 'review', reviewId, {
      rating,
      photoCount: photos.length,
    });

    return { reviewId };
  }

  /** What the homepage renders. Published only — there is no code path that reads pending reviews into a public view. */
  async listPublished(businessId: string, limit = 12): Promise<PublishedReviewSummary> {
    const [entries, totalCount] = await Promise.all([
      reviewRepository.listByStatus(businessId, 'published', { limit }),
      reviewRepository.countByStatus(businessId, 'published'),
    ]);

    const averageRating =
      entries.length > 0
        ? Math.round((entries.reduce((sum, entry) => sum + entry.data.rating, 0) / entries.length) * 10) / 10
        : 0;

    return { reviews: entries.map(toPublicReview), totalCount, averageRating };
  }

  /** The moderation queue (§ Admin: Reviews). */
  async listForModeration(businessId: string, status: ReviewStatus) {
    return reviewRepository.listByStatus(businessId, status, { limit: 100 });
  }

  async countPending(businessId: string): Promise<number> {
    return reviewRepository.countByStatus(businessId, 'pending');
  }

  /**
   * Approve or reject. Rejecting deletes the photos: they were
   * uploaded by an unauthenticated stranger and will never be shown,
   * so keeping them is storage cost and, if the reason for rejection
   * was the image itself, a liability. Best-effort per photo — a
   * storage hiccup must not leave a review stuck in the queue.
   */
  async moderate(
    businessId: string,
    reviewId: string,
    status: Extract<ReviewStatus, 'published' | 'rejected'>,
    actor: string,
  ): Promise<void> {
    const review = await reviewRepository.findById(businessId, reviewId);
    if (!review) {
      throw new ReviewNotFoundError(reviewId);
    }

    await reviewRepository.setStatus(reviewId, status, actor);

    if (status === 'rejected') {
      for (const photo of review.photos) {
        try {
          await storageService.deleteFile(photo.url);
        } catch (error) {
          await publishEvent(businessId, 'ReviewPhotoDeleteFailed', 'review', reviewId, {
            pathname: photo.pathname,
            reason: error instanceof Error ? error.message : 'unknown error',
          });
        }
      }
    }

    await publishEvent(businessId, 'ReviewModerated', 'review', reviewId, { status, actor });
  }
}

export const reviewService = new ReviewService();
export { ReviewService };
