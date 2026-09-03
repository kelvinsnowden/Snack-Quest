import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { reviewService, ReviewValidationError, MAX_REVIEW_PHOTOS } from '@/services/reviewService';
import { StorageUploadError, StorageValidationError } from '@/lib/storage/errors';

/**
 * `POST /api/admin/reviews` (§ reviews that arrive on WhatsApp) — a
 * review a customer sent as a message, entered by a staff member with
 * the screenshot attached.
 *
 * Multipart for the same reason the public route is: the screenshot
 * travels with the review rather than through a separate upload
 * endpoint that hands back a URL. An endpoint like that is a file host
 * with extra steps, and it strands a blob every time somebody uploads
 * and then closes the tab.
 *
 * `ADMIN_ONLY`, matching the moderation route next door. This writes
 * straight to the published set, so it is at least as consequential as
 * approving something already in the queue.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

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

  if (typeof customerName !== 'string' || typeof body !== 'string') {
    return Response.json(
      { error: 'The customer’s name and their review are both required.' },
      { status: 400 },
    );
  }

  const parsedRating = Number.parseInt(typeof rating === 'string' ? rating : '', 10);
  if (!Number.isFinite(parsedRating)) {
    return Response.json({ error: 'Pick a rating from 1 to 5 stars.' }, { status: 400 });
  }

  const files = formData.getAll('photos').filter((entry): entry is File => entry instanceof File);
  if (files.length > MAX_REVIEW_PHOTOS) {
    return Response.json(
      { error: `You can attach up to ${MAX_REVIEW_PHOTOS} screenshots.` },
      { status: 400 },
    );
  }

  const photos = await Promise.all(
    files.map(async (file) => ({
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      data: Buffer.from(await file.arrayBuffer()),
    })),
  );

  try {
    const { reviewId } = await reviewService.addFromStaff(
      session.businessId,
      {
        customerName,
        rating: parsedRating,
        body,
        contactPhone: typeof contactPhone === 'string' ? contactPhone : undefined,
        photos,
      },
      session.uid,
    );
    return Response.json({ reviewId }, { status: 201 });
  } catch (error) {
    if (error instanceof ReviewValidationError || error instanceof StorageValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof StorageUploadError) {
      return Response.json(
        { error: 'The screenshot couldn’t be saved. Try again, or add the review without it.' },
        { status: 502 },
      );
    }
    throw error;
  }
}
