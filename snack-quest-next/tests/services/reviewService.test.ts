import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { seedOrder } from '../helpers/orderFixtures';
import type { Order } from '@/types';

const { uploadFileMock, deleteFileMock, getMetadataMock, listFilesMock } = vi.hoisted(() => ({
  uploadFileMock: vi.fn(),
  deleteFileMock: vi.fn(),
  getMetadataMock: vi.fn(),
  listFilesMock: vi.fn(),
}));

// The real StorageService runs — MIME allowlist, size cap and
// magic-byte check all included — with only the Vercel Blob network
// call faked, so these tests actually exercise the validation a public
// submission has to get past.
vi.mock('@/lib/integrations/vercelBlob/vercelBlobGateway', () => ({
  vercelBlobGateway: {
    uploadFile: uploadFileMock,
    deleteFile: deleteFileMock,
    getMetadata: getMetadataMock,
    listFiles: listFilesMock,
  },
}));

import { reviewService, ReviewValidationError, MAX_REVIEWS_PER_PHONE_PER_DAY } from '@/services/reviewService';
import { reviewRepository } from '@/repositories/reviewRepository';

const BUSINESS_ID = 'biz-review-service-test';

/** A real 1x1 PNG — the magic-byte check in StorageService is not a formality. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function photo(overrides: Partial<{ filename: string; contentType: string; data: Buffer }> = {}) {
  return { filename: 'box.png', contentType: 'image/png', data: PNG, ...overrides };
}

function validReview(overrides: Record<string, unknown> = {}) {
  return {
    customerName: 'Wanjiru Kamau',
    rating: 5,
    body: 'The wasabi crisps were a genuine shock and I loved every second.',
    photos: [],
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  uploadFileMock.mockImplementation(async ({ pathname }: { pathname: string }) => ({
    url: `https://blob.example/${pathname}`,
    pathname,
    contentType: 'image/png',
    size: PNG.byteLength,
  }));
  deleteFileMock.mockResolvedValue(undefined);
  for (const collection of ['reviews', 'domainEvents', 'orders']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
});

/**
 * Verified purchase + the "who should we ask" queue (§ Mission 2 —
 * review acquisition). Both read real orders, so these run against
 * seeded orders rather than mocks — the point under test is exactly
 * whether the order lookup is right.
 */
describe('verified purchase', () => {
  it('marks a review verified when its phone number matches a real paid order', async () => {
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed' });

    const { reviewId } = await reviewService.submitReview(BUSINESS_ID, {
      ...validReview(),
      contactPhone: '0712345678',
    });

    const stored = await reviewRepository.findById(BUSINESS_ID, reviewId);
    expect(stored?.isVerifiedPurchase).toBe(true);
    expect(stored?.verifiedOrderId).toBeTruthy();
  });

  it('does not mark a review verified when no order matches that number', async () => {
    const { reviewId } = await reviewService.submitReview(BUSINESS_ID, {
      ...validReview(),
      contactPhone: '0799999999',
    });

    const stored = await reviewRepository.findById(BUSINESS_ID, reviewId);
    expect(stored?.isVerifiedPurchase).toBe(false);
    expect(stored?.verifiedOrderId).toBeNull();
  });

  it('does not mark a review verified when no phone number was given at all', async () => {
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed' });

    const { reviewId } = await reviewService.submitReview(BUSINESS_ID, {
      ...validReview(),
      contactPhone: undefined,
    });

    const stored = await reviewRepository.findById(BUSINESS_ID, reviewId);
    expect(stored?.isVerifiedPurchase).toBe(false);
  });

  it('does not verify against a cancelled order — the badge must not outlive the purchase', async () => {
    await seedOrder({ businessId: BUSINESS_ID, status: 'cancelled' });

    const { reviewId } = await reviewService.submitReview(BUSINESS_ID, {
      ...validReview(),
      contactPhone: '0712345678',
    });

    const stored = await reviewRepository.findById(BUSINESS_ID, reviewId);
    expect(stored?.isVerifiedPurchase).toBe(false);
  });

  it('never leaks the badge across businesses', async () => {
    await seedOrder({ businessId: 'some-other-business', status: 'confirmed' });

    const { reviewId } = await reviewService.submitReview(BUSINESS_ID, {
      ...validReview(),
      contactPhone: '0712345678',
    });

    const stored = await reviewRepository.findById(BUSINESS_ID, reviewId);
    expect(stored?.isVerifiedPurchase).toBe(false);
  });

  it('publishes the badge on the public shape', async () => {
    await seedOrder({ businessId: BUSINESS_ID, status: 'delivered' });
    const { reviewId } = await reviewService.submitReview(BUSINESS_ID, {
      ...validReview(),
      contactPhone: '0712345678',
    });
    await reviewService.moderate(BUSINESS_ID, reviewId, 'published', 'staff-1');

    const published = await reviewService.listPublished(BUSINESS_ID);
    expect(published.reviews[0].isVerifiedPurchase).toBe(true);
  });
});

describe('listAwaitingReviewRequest', () => {
  // Cast for the same reason `businessAnalyticsService.test.ts` does:
  // fixtures write through the Admin SDK, while `Order` is typed
  // against the client SDK's `Timestamp`. The two are structurally
  // different types for the same stored value.
  const longAgo = () =>
    Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000) as unknown as Order['createdAt'];

  it('lists a paid customer who is past the waiting period and has never been asked', async () => {
    await seedOrder({ businessId: BUSINESS_ID, status: 'delivered', createdAt: longAgo() });

    const candidates = await reviewService.listAwaitingReviewRequest(BUSINESS_ID);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].customerName).toBe('Jane Wanjiru');
  });

  it('excludes an order placed too recently to have arrived', async () => {
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed' });

    expect(await reviewService.listAwaitingReviewRequest(BUSINESS_ID)).toHaveLength(0);
  });

  it('excludes a customer who has already been asked', async () => {
    const orderId = await seedOrder({
      businessId: BUSINESS_ID,
      status: 'delivered',
      createdAt: longAgo(),
    });
    await reviewService.markReviewRequested(BUSINESS_ID, orderId, 'staff-1');

    expect(await reviewService.listAwaitingReviewRequest(BUSINESS_ID)).toHaveLength(0);
  });

  it('excludes a customer who has already left a review', async () => {
    await seedOrder({ businessId: BUSINESS_ID, status: 'delivered', createdAt: longAgo() });
    await reviewService.submitReview(BUSINESS_ID, { ...validReview(), contactPhone: '0712345678' });

    expect(await reviewService.listAwaitingReviewRequest(BUSINESS_ID)).toHaveLength(0);
  });

  it('lists a repeat customer once, not once per order', async () => {
    await seedOrder({ businessId: BUSINESS_ID, status: 'delivered', createdAt: longAgo() });
    await seedOrder({ businessId: BUSINESS_ID, status: 'delivered', createdAt: longAgo() });

    expect(await reviewService.listAwaitingReviewRequest(BUSINESS_ID)).toHaveLength(1);
  });

  it('never lists another business’s customers', async () => {
    await seedOrder({ businessId: 'some-other-business', status: 'delivered', createdAt: longAgo() });

    expect(await reviewService.listAwaitingReviewRequest(BUSINESS_ID)).toHaveLength(0);
  });
});

describe('submitReview', () => {
  it('stores a review as pending, never published', async () => {
    const { reviewId } = await reviewService.submitReview(BUSINESS_ID, validReview());

    const stored = await reviewRepository.findById(BUSINESS_ID, reviewId);
    // The entire safety model for a public form that accepts photos.
    expect(stored?.status).toBe('pending');
    expect(stored?.customerName).toBe('Wanjiru Kamau');
    expect(stored?.rating).toBe(5);
  });

  it('keeps a pending review off the homepage', async () => {
    await reviewService.submitReview(BUSINESS_ID, validReview());

    const published = await reviewService.listPublished(BUSINESS_ID);
    expect(published.reviews).toEqual([]);
    expect(published.totalCount).toBe(0);
    // No published reviews means no average, not a flattering default.
    expect(published.averageRating).toBe(0);
  });

  it('uploads photos into the reviews directory and records both url and pathname', async () => {
    const { reviewId } = await reviewService.submitReview(
      BUSINESS_ID,
      validReview({ photos: [photo(), photo({ filename: 'snack.png' })] }),
    );

    const stored = await reviewRepository.findById(BUSINESS_ID, reviewId);
    expect(stored?.photos).toHaveLength(2);
    expect(stored?.photos[0].pathname).toMatch(new RegExp(`^reviews/${BUSINESS_ID}/`));
    // The pathname exists so a rejected review's photos can actually be
    // deleted rather than orphaned.
    expect(stored?.photos[0].url).toContain('reviews/');
  });

  it('rejects a file that is not really an image, whatever it claims to be', async () => {
    await expect(
      reviewService.submitReview(
        BUSINESS_ID,
        validReview({ photos: [photo({ data: Buffer.from('#!/bin/sh\nrm -rf /') })] }),
      ),
    ).rejects.toThrow();

    expect(uploadFileMock).not.toHaveBeenCalled();
  });

  it('rejects a non-image content type outright', async () => {
    await expect(
      reviewService.submitReview(
        BUSINESS_ID,
        validReview({ photos: [photo({ contentType: 'application/pdf' })] }),
      ),
    ).rejects.toThrow();
  });

  it('refuses more photos than the limit', async () => {
    await expect(
      reviewService.submitReview(BUSINESS_ID, validReview({ photos: [photo(), photo(), photo(), photo()] })),
    ).rejects.toBeInstanceOf(ReviewValidationError);
  });

  it.each([
    ['a missing name', { customerName: 'A' }],
    ['a one-word review', { body: 'Nice' }],
    ['a rating of zero', { rating: 0 }],
    ['a rating above five', { rating: 9 }],
  ])('rejects %s', async (_label, overrides) => {
    await expect(
      reviewService.submitReview(BUSINESS_ID, validReview(overrides)),
    ).rejects.toBeInstanceOf(ReviewValidationError);
  });

  it('rejects a phone number that is not a real Kenyan mobile', async () => {
    await expect(
      reviewService.submitReview(BUSINESS_ID, validReview({ contactPhone: '+1 555 010 4567' })),
    ).rejects.toBeInstanceOf(ReviewValidationError);
  });

  it('rate-limits by phone number regardless of how it was typed', async () => {
    for (let i = 0; i < MAX_REVIEWS_PER_PHONE_PER_DAY; i += 1) {
      await reviewService.submitReview(BUSINESS_ID, validReview({ contactPhone: '0712345678' }));
    }

    // Same number, written differently — normalization is what stops
    // the limit being walked around.
    await expect(
      reviewService.submitReview(BUSINESS_ID, validReview({ contactPhone: '+254712345678' })),
    ).rejects.toBeInstanceOf(ReviewValidationError);
  });
});

describe('moderate', () => {
  it('publishing puts the review on the homepage', async () => {
    const { reviewId } = await reviewService.submitReview(BUSINESS_ID, validReview({ rating: 4 }));

    await reviewService.moderate(BUSINESS_ID, reviewId, 'published', 'staff-1');

    const published = await reviewService.listPublished(BUSINESS_ID);
    expect(published.reviews).toHaveLength(1);
    expect(published.totalCount).toBe(1);
    expect(published.averageRating).toBe(4);
    // The reviewer's phone number is for staff follow-up and never
    // leaves the server.
    expect(published.reviews[0]).not.toHaveProperty('contactPhone');
  });

  it('rejecting deletes the photos rather than leaving them in storage', async () => {
    const { reviewId } = await reviewService.submitReview(BUSINESS_ID, validReview({ photos: [photo()] }));

    await reviewService.moderate(BUSINESS_ID, reviewId, 'rejected', 'staff-1');

    expect(deleteFileMock).toHaveBeenCalledTimes(1);
    const stored = await reviewRepository.findById(BUSINESS_ID, reviewId);
    expect(stored?.status).toBe('rejected');
  });

  it('does not leave a review stuck in the queue when photo deletion fails', async () => {
    deleteFileMock.mockRejectedValue(new Error('blob store unreachable'));
    const { reviewId } = await reviewService.submitReview(BUSINESS_ID, validReview({ photos: [photo()] }));

    await reviewService.moderate(BUSINESS_ID, reviewId, 'rejected', 'staff-1');

    const stored = await reviewRepository.findById(BUSINESS_ID, reviewId);
    expect(stored?.status).toBe('rejected');
  });

  it('never moderates another business’s review', async () => {
    const { reviewId } = await reviewService.submitReview(BUSINESS_ID, validReview());

    await expect(
      reviewService.moderate('some-other-business', reviewId, 'published', 'staff-1'),
    ).rejects.toThrow();
  });

  it('takes a published review back down', async () => {
    const { reviewId } = await reviewService.submitReview(BUSINESS_ID, validReview());
    await reviewService.moderate(BUSINESS_ID, reviewId, 'published', 'staff-1');

    await reviewService.moderate(BUSINESS_ID, reviewId, 'rejected', 'staff-2');

    expect((await reviewService.listPublished(BUSINESS_ID)).reviews).toEqual([]);
  });
});

describe('listPublished', () => {
  it('averages only what is actually published', async () => {
    for (const rating of [5, 4, 3]) {
      const { reviewId } = await reviewService.submitReview(BUSINESS_ID, validReview({ rating }));
      await reviewService.moderate(BUSINESS_ID, reviewId, 'published', 'staff-1');
    }
    // A pending 1-star must not drag the public average down before
    // anyone has decided whether it is shown at all.
    await reviewService.submitReview(BUSINESS_ID, validReview({ rating: 1 }));

    const published = await reviewService.listPublished(BUSINESS_ID);
    expect(published.totalCount).toBe(3);
    expect(published.averageRating).toBe(4);
  });

  it('counts and averages across every published review, not just the page fetched for display', async () => {
    const ratings = [5, 5, 5, 5, 4, 3, 3, 2, 1];
    for (const rating of ratings) {
      const { reviewId } = await reviewService.submitReview(BUSINESS_ID, validReview({ rating }));
      await reviewService.moderate(BUSINESS_ID, reviewId, 'published', 'staff-1');
    }

    // A `limit` far smaller than the published set — the histogram and
    // average must still reflect all nine, not just the three fetched.
    const published = await reviewService.listPublished(BUSINESS_ID, 3);
    expect(published.reviews).toHaveLength(3);
    expect(published.totalCount).toBe(9);
    expect(published.ratingCounts).toEqual({ 1: 1, 2: 1, 3: 2, 4: 1, 5: 4 });
    expect(published.averageRating).toBe(
      Math.round((ratings.reduce((sum, r) => sum + r, 0) / ratings.length) * 10) / 10,
    );
  });

  it('reports an empty histogram when there are no published reviews', async () => {
    const published = await reviewService.listPublished(BUSINESS_ID);
    expect(published.ratingCounts).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  });
});
