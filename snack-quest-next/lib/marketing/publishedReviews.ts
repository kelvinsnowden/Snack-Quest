import 'server-only';

import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { reviewService, type PublishedReviewSummary } from '@/services/reviewService';

/**
 * The published reviews the public site renders, cached across
 * requests (§ site load time).
 *
 * The marketing layout is `force-dynamic`, and it has to be: stock is
 * read live and `/checkout` reads a cookie. So every public page view
 * is a real server render, and the only way to make one cheaper is to
 * stop it doing I/O it does not need to repeat.
 *
 * This is two Firestore queries, not one — `listByStatus` for the
 * reviews themselves and `countByStatusPerRating` for the histogram —
 * and since the homepage's limit rose to 24 the first of them returns
 * two dozen documents with their photo arrays. Every homepage view was
 * paying for both, from a serverless region a long way from the
 * database, to render a set of reviews that changes when somebody
 * moderates one.
 *
 * Same two-layer shape as `getCurrentBusiness`, for the same two
 * reasons: `cache()` stops one render's homepage section and its
 * JSON-LD each issuing their own read, and `unstable_cache` is the
 * layer that removes the round trip from the next visitor's render
 * entirely.
 *
 * Five minutes, and tagged, so the wait is not how a newly published
 * review reaches the site — the admin moderation route calls
 * `revalidateTag('reviews')` and it appears at once. The TTL is the
 * backstop for anything that changes reviews without going through
 * that route, not the mechanism.
 *
 * Safe to cache as-is because `PublishedReviewSummary` is already
 * plain: `toPublicReview` converts Firestore Timestamps to ISO
 * strings before this ever sees them. The FAQ and snack queries on
 * the same page are deliberately NOT cached here — those return raw
 * documents whose Timestamps do not survive the cache boundary, and
 * projecting them would mean changing what their components accept.
 */
export const REVIEWS_CACHE_TAG = 'reviews';

const CACHE_TTL_SECONDS = 300;

const loadPublished = unstable_cache(
  async (businessId: string, limit: number): Promise<PublishedReviewSummary> =>
    reviewService.listPublished(businessId, limit),
  ['marketing-published-reviews'],
  { revalidate: CACHE_TTL_SECONDS, tags: [REVIEWS_CACHE_TAG] },
);

/**
 * `limit` is part of the cache key, so the homepage's 24 and
 * `/reviews`' 60 are cached separately rather than one silently
 * serving the other a short list.
 */
export const getPublishedReviews = cache(
  async (businessId: string, limit: number): Promise<PublishedReviewSummary> =>
    loadPublished(businessId, limit),
);
