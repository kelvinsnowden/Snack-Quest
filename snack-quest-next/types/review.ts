import type { AuditFields } from './common';

/**
 * `reviews/{reviewId}` — a customer's own words about their box
 * (§ homepage reviews).
 *
 * Submitted through a public link anyone can be sent, which is the
 * whole point: a customer who just opened their box should be able to
 * say so in thirty seconds from their phone, without an account.
 *
 * That also means every review arrives from an unauthenticated
 * stranger, with photos attached. So nothing is published on arrival —
 * a review lands as `pending` and only reaches the homepage once a
 * staff member approves it. The alternative is handing the public an
 * image-upload form that renders straight onto the front page, which
 * is not a feature, it's an incident waiting to happen.
 */

export type ReviewStatus = 'pending' | 'published' | 'rejected';

/** One photo the customer attached, already uploaded to Vercel Blob. */
export interface ReviewPhoto {
  url: string;
  /** Vercel Blob pathname, kept so a rejected review's photos can actually be deleted rather than orphaned. */
  pathname: string;
}

/**
 * A video the customer attached. Unlike photos, this was uploaded by
 * the browser straight to Blob storage before the review was
 * submitted (see `app/api/reviews/video/route.ts` for why it cannot
 * travel with the rest of the form), so the URL arrives from the
 * client and is verified server-side before it is trusted.
 */
export interface ReviewVideo {
  url: string;
  /** Kept for the same reason as a photo's: a rejected review's video has to be deletable, not orphaned. */
  pathname: string;
}

export interface Review extends AuditFields {
  businessId: string;
  /** As the customer typed it. Displayed publicly, so it's their choice what to be called. */
  customerName: string;
  /** 1–5. Validated server-side; a review with no usable rating is rejected at submission, never stored as 0. */
  rating: number;
  body: string;
  photos: ReviewPhoto[];
  /** Null on every review submitted before video existed, and on every review where the customer chose photos instead. */
  video?: ReviewVideo | null;
  status: ReviewStatus;
  /**
   * Optional and never displayed — only so staff can reach the person
   * if a review needs following up (a complaint worth resolving, or a
   * photo worth asking permission to reuse).
   */
  contactPhone: string | null;
  /** Who approved or rejected it, and when — null while pending. */
  moderatedBy: string | null;
  moderatedAt: Date | null;
}

/** The shape the public homepage and review page render — deliberately without `contactPhone` or any moderation metadata. */
export interface PublicReview {
  id: string;
  customerName: string;
  rating: number;
  body: string;
  photos: { url: string }[];
  /** Null when the customer attached photos instead, or nothing at all. */
  videoUrl: string | null;
  /** ISO string rather than a Firestore Timestamp: this crosses into Client Components. */
  createdAtIso: string;
}
