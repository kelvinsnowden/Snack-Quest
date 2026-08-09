import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { reviewService, ReviewValidationError } from '@/services/reviewService';
import { reviewRepository } from '@/repositories/reviewRepository';

/**
 * The video URL is the only part of a review that arrives as a URL
 * rather than as bytes we uploaded ourselves — the browser sends it
 * straight to Blob storage, because a video cannot fit inside the
 * request that carries the rest of the form.
 *
 * That makes it the one place a stranger's string can become part of
 * published content, so these tests are about refusing everything that
 * isn't genuinely ours.
 */

const BUSINESS_ID = 'review-video-test-business';

const BASE = {
  customerName: 'Wanjiru K.',
  rating: 5,
  body: 'The box was incredible, everything was a surprise.',
  photos: [],
};

async function submit(videoUrl: string | null) {
  return reviewService.submitReview(BUSINESS_ID, { ...BASE, videoUrl });
}

beforeEach(async () => {
  const existing = await adminFirestore
    .collection('reviews')
    .where('businessId', '==', BUSINESS_ID)
    .get();
  await Promise.all(existing.docs.map((doc) => doc.ref.delete()));
});

describe('review video URL verification', () => {
  it('accepts a real video on our own Blob host under the reviews prefix', async () => {
    const url =
      'https://abc123.public.blob.vercel-storage.com/reviews/box-opening-Xy7.mp4';
    const { reviewId } = await submit(url);

    const stored = await reviewRepository.findById(BUSINESS_ID, reviewId);
    expect(stored?.video).toEqual({
      url,
      pathname: 'reviews/box-opening-Xy7.mp4',
    });
  });

  it('stores no video when none was attached', async () => {
    const { reviewId } = await submit(null);
    const stored = await reviewRepository.findById(BUSINESS_ID, reviewId);
    expect(stored?.video ?? null).toBeNull();
  });

  it.each([
    ['a different site entirely', 'https://evil.example.com/reviews/clip.mp4'],
    ['a lookalike host', 'https://public.blob.vercel-storage.com.evil.example/reviews/clip.mp4'],
    ['plain http', 'http://abc123.public.blob.vercel-storage.com/reviews/clip.mp4'],
    ['a path outside reviews', 'https://abc123.public.blob.vercel-storage.com/creators/clip.mp4'],
    ['a traversal attempt', 'https://abc123.public.blob.vercel-storage.com/../creators/clip.mp4'],
    ['something that is not a URL', 'reviews/clip.mp4'],
    ['a javascript URL', 'javascript:alert(1)'],
  ])('refuses %s', async (_label, url) => {
    await expect(submit(url)).rejects.toBeInstanceOf(ReviewValidationError);
  });

  it('never leaks why it refused — the message is the same for every rejection', async () => {
    await expect(submit('https://evil.example.com/reviews/clip.mp4')).rejects.toThrow(
      'That video could not be attached. Please try again.',
    );
  });
});
