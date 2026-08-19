import 'server-only';

import { reviewRepository } from '@/repositories/reviewRepository';
import { orderRepository } from '@/repositories/orderRepository';
import { storageService } from '@/services/storageService';
import { normalizeKenyanPhone } from '@/lib/checkout/phone';
import { publishEvent } from '@/lib/events/eventBus';
import { toMillis } from '@/lib/firestoreTimestamp';
import type { OrderStatus, PublicReview, Review, ReviewPhoto, ReviewStatus, ReviewVideo } from '@/types';

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

/**
 * The order states that count as a real purchase behind a "Verified
 * purchase" badge (§ Mission 2 — review acquisition). An order only
 * exists at all once a payment succeeded (see `types/order.ts`), so
 * this is about whether the order still stands: `cancelled` and the
 * refund states are excluded, since a badge saying someone bought the
 * box shouldn't survive the box being cancelled or paid back.
 */
const VERIFIED_PURCHASE_STATUSES: OrderStatus[] = ['confirmed', 'dispatched', 'delivered'];

/**
 * How long after an order is placed a customer is worth asking for a
 * review. Deliberately measured from `createdAt` rather than from a
 * `delivered` status: delivery is marked by hand today and can lag
 * reality, so keying off it would hide customers who really did get
 * their box. Boxes ship within 24 hours and arrive in 24–48, so five
 * days is comfortably past arrival without being so late the box is
 * forgotten.
 */
export const REVIEW_REQUEST_ELIGIBLE_AFTER_DAYS = 5;

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
  /** The Blob URL the browser uploaded to before submitting, or null. Verified here — never trusted as given. */
  videoUrl?: string | null;
}

export interface PublishedReviewSummary {
  reviews: PublicReview[];
  /** How many published reviews exist in total, which is not the same as how many are shown. */
  totalCount: number;
  /** Mean rating across published reviews, one decimal place. 0 when there are none — never a fabricated 5. */
  averageRating: number;
  /** How many published reviews sit at each star rating, 1 through 5 — the whole set, not just the ones fetched for display. */
  ratingCounts: Record<1 | 2 | 3 | 4 | 5, number>;
}

/**
 * Turns the URL the browser reports after its direct-to-Blob upload
 * into a stored `ReviewVideo`, or rejects it.
 *
 * Everything else on a review is bytes we uploaded ourselves, so this
 * is the only place a client-supplied URL becomes part of published
 * content. Treated accordingly: it has to parse, be https, sit on the
 * exact Blob host this deployment writes to, and live under the
 * reviews prefix. Anything else — a link to another site, a
 * lookalike host, a path outside reviews — is not a near miss to be
 * corrected, it is someone doing something else, so it is refused
 * outright rather than sanitised.
 */
function parseReviewVideoUrl(raw: string | null): ReviewVideo | null {
  if (!raw) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ReviewValidationError('That video could not be attached. Please try again.');
  }

  const expectedHost = process.env.BLOB_PUBLIC_HOST;
  const hostAllowed = expectedHost
    ? url.hostname === expectedHost
    : url.hostname.endsWith('.public.blob.vercel-storage.com');

  const pathname = url.pathname.replace(/^\//, '');
  if (url.protocol !== 'https:' || !hostAllowed || !pathname.startsWith('reviews/')) {
    throw new ReviewValidationError('That video could not be attached. Please try again.');
  }

  return { url: url.toString(), pathname };
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
    videoUrl: entry.data.video?.url ?? null,
    createdAtIso: new Date(toMillis(entry.data.createdAt)).toISOString(),
    // Absent on every review predating verification, which reads as
    // false — the badge is only ever shown on a confirmed match.
    // `verifiedOrderId` stays server-side: it identifies an order, and
    // nothing public needs it.
    isVerifiedPurchase: entry.data.isVerifiedPurchase === true,
  };
}

/** One customer worth asking for a review, with why they qualify. */
export interface ReviewRequestCandidate {
  orderId: string;
  orderNumber: number | null;
  customerName: string;
  phoneNumber: string;
  packageLabel: string;
  status: OrderStatus;
  placedAtIso: string;
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

    // The one field on a review that arrives as a URL rather than as
    // bytes we uploaded ourselves, because the video went straight
    // from the browser to Blob storage. So it is checked rather than
    // believed: it must be a real URL on our own Blob host, under the
    // reviews prefix. Without this, the form is an open invitation to
    // hang any URL on the internet off a published review card.
    //
    // Validated before any photo upload runs, not after: every other
    // check on this submission is a plain in-memory check, so this was
    // the only way a rejection could happen *after* bytes had already
    // reached storage — and that would leave the just-uploaded photos
    // orphaned, the exact "free file host" risk this endpoint exists to
    // avoid (see the module doc comment).
    const video = parseReviewVideoUrl(input.videoUrl ?? null);

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

    // Does this number belong to someone who actually bought a box?
    // Checked here rather than asked of the reviewer, because a claim
    // the customer types about themselves is not verification. Failure
    // is not fatal: an unverifiable review is still a real review, so a
    // lookup problem downgrades the badge rather than rejecting a
    // submission the customer has already written.
    let verifiedOrderId: string | null = null;
    if (contactPhone) {
      try {
        const order = await orderRepository.findPaidOrderForPhone(
          businessId,
          contactPhone,
          VERIFIED_PURCHASE_STATUSES,
        );
        verifiedOrderId = order?.id ?? null;
      } catch {
        verifiedOrderId = null;
      }
    }

    const reviewId = await reviewRepository.create({
      businessId,
      customerName,
      rating,
      body,
      photos,
      video,
      contactPhone,
      isVerifiedPurchase: verifiedOrderId !== null,
      verifiedOrderId,
      // Never published on arrival — see types/review.ts.
      status: 'pending',
    });

    await publishEvent(businessId, 'ReviewSubmitted', 'review', reviewId, {
      rating,
      photoCount: photos.length,
      hasVideo: video !== null,
      isVerifiedPurchase: verifiedOrderId !== null,
    });

    return { reviewId };
  }

  /**
   * Customers who have had their box long enough to have an opinion,
   * have not already been asked, and have not already reviewed
   * (§ Mission 2 — review acquisition).
   *
   * This is a worklist, not an automation: nothing in this codebase
   * messages these people. A staff member reads the list, reaches out
   * however they normally would, and records it with
   * `markReviewRequested`. That split is deliberate — the messaging
   * integrations are explicitly out of scope, and a queue a human works
   * is useful today without them.
   */
  async listAwaitingReviewRequest(businessId: string, limit = 25): Promise<ReviewRequestCandidate[]> {
    const placedBefore = new Date(
      Date.now() - REVIEW_REQUEST_ELIGIBLE_AFTER_DAYS * 24 * 60 * 60 * 1000,
    );

    const [candidates, reviewedPhones] = await Promise.all([
      orderRepository.listReviewRequestCandidates(businessId, {
        placedBefore,
        statuses: VERIFIED_PURCHASE_STATUSES,
      }),
      reviewRepository.listContactPhones(businessId),
    ]);

    const alreadyReviewed = new Set(reviewedPhones);
    const seenPhones = new Set<string>();
    const result: ReviewRequestCandidate[] = [];

    for (const { id, data } of candidates) {
      if (result.length >= limit) {
        break;
      }
      if (data.reviewRequestedAt) {
        continue;
      }
      const phone = data.customer.phoneNumber;
      if (alreadyReviewed.has(phone)) {
        continue;
      }
      // A repeat customer should appear once, not once per order —
      // the ask is to a person, not to an order line. Candidates are
      // newest-first, so this keeps their most recent box.
      if (seenPhones.has(phone)) {
        continue;
      }
      seenPhones.add(phone);

      result.push({
        orderId: id,
        orderNumber: data.orderNumber ?? null,
        customerName: data.customer.customerName,
        phoneNumber: phone,
        packageLabel: data.product.packageLabel,
        status: data.status,
        placedAtIso: new Date(toMillis(data.createdAt)).toISOString(),
      });
    }

    return result;
  }

  /** Records that a staff member asked this customer for a review. */
  async markReviewRequested(businessId: string, orderId: string, actor: string): Promise<void> {
    const order = await orderRepository.findById(orderId);
    if (!order || order.businessId !== businessId) {
      throw new ReviewNotFoundError(orderId);
    }
    await orderRepository.markReviewRequested(orderId, actor);
    await publishEvent(businessId, 'ReviewRequested', 'order', orderId, { actor });
  }

  /**
   * What the homepage and `/reviews` render. Published only — there is
   * no code path that reads pending reviews into a public view.
   *
   * `totalCount`, `averageRating` and `ratingCounts` are computed from
   * every published review, not from the `limit`-bounded `entries`
   * fetched for display — a shop with more published reviews than a
   * page shows must still report its real rating, not the rating of
   * whichever page happened to load.
   */
  async listPublished(businessId: string, limit = 12): Promise<PublishedReviewSummary> {
    const [entries, ratingCounts] = await Promise.all([
      reviewRepository.listByStatus(businessId, 'published', { limit }),
      reviewRepository.countByStatusPerRating(businessId, 'published'),
    ]);

    const totalCount = ratingCounts[1] + ratingCounts[2] + ratingCounts[3] + ratingCounts[4] + ratingCounts[5];
    const ratingSum =
      ratingCounts[1] * 1 + ratingCounts[2] * 2 + ratingCounts[3] * 3 + ratingCounts[4] * 4 + ratingCounts[5] * 5;
    const averageRating = totalCount > 0 ? Math.round((ratingSum / totalCount) * 10) / 10 : 0;

    return { reviews: entries.map(toPublicReview), totalCount, averageRating, ratingCounts };
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
   * was the image itself, a liability. The video goes the same way,
   * and matters more: it is the largest object a stranger can put in
   * our storage, so a rejected one left behind is both the biggest
   * cost and the biggest liability. Best-effort per file — a storage
   * hiccup must not leave a review stuck in the queue.
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
      const attachments = [
        ...review.photos,
        ...(review.video ? [review.video] : []),
      ];
      for (const attachment of attachments) {
        try {
          await storageService.deleteFile(attachment.url);
        } catch (error) {
          await publishEvent(businessId, 'ReviewPhotoDeleteFailed', 'review', reviewId, {
            pathname: attachment.pathname,
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
