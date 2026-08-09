import { reviewService, ReviewValidationError, MAX_REVIEW_PHOTOS } from '@/services/reviewService';
import { StorageUploadError, StorageValidationError } from '@/lib/storage/errors';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';

/**
 * `POST /api/reviews` (§ homepage reviews) — where the shareable
 * review link submits to. Public and unauthenticated by design: a
 * customer who just opened their box should be able to say so from
 * their phone in thirty seconds, and requiring an account would mean
 * nobody ever does.
 *
 * Photos arrive in the same multipart request as the text rather than
 * through a separate upload endpoint. That is deliberate: a public
 * upload endpoint that returns a URL is a free file host, and it
 * strands a blob every time someone uploads and then abandons the
 * form. Here nothing is stored unless a real review is being written
 * with it.
 *
 * Nothing submitted here is visible to anyone until a staff member
 * approves it — see `ReviewService.submitReview`.
 */
export async function POST(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Expected multipart/form-data.' }, { status: 400 });
  }

  const customerName = formData.get('customerName');
  const body = formData.get('body');
  const rating = formData.get('rating');
  const contactPhone = formData.get('contactPhone');
  const videoUrl = formData.get('videoUrl');

  if (typeof customerName !== 'string' || typeof body !== 'string') {
    return Response.json({ error: 'Your name and review are both required.' }, { status: 400 });
  }

  const parsedRating = Number.parseInt(typeof rating === 'string' ? rating : '', 10);
  if (!Number.isFinite(parsedRating)) {
    return Response.json({ error: 'Please pick a rating from 1 to 5 stars.' }, { status: 400 });
  }

  const files = formData.getAll('photos').filter((entry): entry is File => entry instanceof File);
  if (files.length > MAX_REVIEW_PHOTOS) {
    return Response.json({ error: `You can add up to ${MAX_REVIEW_PHOTOS} photos.` }, { status: 400 });
  }

  const photos = await Promise.all(
    files.map(async (file) => ({
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      data: Buffer.from(await file.arrayBuffer()),
    })),
  );

  try {
    const { reviewId } = await reviewService.submitReview(getCurrentBusinessId(), {
      customerName,
      rating: parsedRating,
      body,
      contactPhone: typeof contactPhone === 'string' ? contactPhone : undefined,
      photos,
      // Already in Blob storage by the time this request is made — the
      // browser put it there directly, because a video cannot fit in
      // this request at all. `submitReview` verifies the URL rather
      // than trusting it.
      videoUrl: typeof videoUrl === 'string' && videoUrl ? videoUrl : null,
    });
    return Response.json({ reviewId }, { status: 201 });
  } catch (error) {
    if (error instanceof ReviewValidationError || error instanceof StorageValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof StorageUploadError) {
      return Response.json(
        { error: 'We couldn’t save your photos. Try again, or post the review without them.' },
        { status: 502 },
      );
    }
    throw error;
  }
}
