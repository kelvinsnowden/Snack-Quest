import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { REVIEW_VIDEO_ENABLED, REVIEW_VIDEO_POLICY } from '@/lib/storage/policies';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';

/**
 * `POST /api/reviews/video` (§ review video) — issues a short-lived,
 * tightly scoped token so the browser can upload one review video
 * directly to Blob storage.
 *
 * Why the video does not go through `POST /api/reviews` with the rest
 * of the review, the way photos do: Vercel caps a function's request
 * body at 4.5MB. A phone video is 10-100MB, so that route cannot
 * physically carry it — the request is rejected by the platform before
 * our code runs, which is exactly the failure that hid behind
 * "couldn't reach Snack Quest" for photos earlier. Uploading straight
 * to Blob is the only path that works, not a preference.
 *
 * That trade is real and worth naming: `/api/reviews` deliberately
 * takes photos in-band precisely so there is no public endpoint that
 * turns bytes into a hosted URL. This is that endpoint. So it is
 * fenced as tightly as it can be while still doing its job:
 *
 *   - Video MIME types only, and a hard byte ceiling, both enforced by
 *     Blob itself at upload time rather than by us afterwards — a
 *     client that lies about either gets rejected by the storage
 *     layer, not by a check it could skip.
 *   - `addRandomSuffix` so a caller cannot choose a path, overwrite
 *     someone else's object, or guess another review's video.
 *   - Uploads land under `reviews/` and are useless on their own: a
 *     video only ever becomes visible if it arrives attached to a
 *     review that a staff member then approves.
 *
 * What it does not solve: someone can still burn storage by uploading
 * and never submitting the form. Those blobs are orphaned by design
 * rather than dangerous — unreferenced, unreachable from any page, and
 * safe to sweep. Worth watching the Blob usage graph after launch.
 */
export async function POST(request: Request): Promise<Response> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  // Checked here as well as in the form, because the form is not what
  // protects this — anyone can post to this endpoint directly.
  if (!REVIEW_VIDEO_ENABLED) {
    return Response.json({ error: 'Video reviews are not available.' }, { status: 404 });
  }

  const businessId = getCurrentBusinessId();

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [...REVIEW_VIDEO_POLICY.allowedMimeTypes],
        maximumSizeInBytes: REVIEW_VIDEO_POLICY.maxSizeBytes,
        addRandomSuffix: true,
        // Echoed back on completion; keeps the object attributable to
        // a tenant the same way StorageService path-scopes everything
        // else.
        tokenPayload: JSON.stringify({ businessId }),
      }),
      // Required by the contract. Nothing to do here on purpose: a
      // video is not a review, and the review it belongs to is written
      // by POST /api/reviews when the customer actually submits the
      // form. Recording anything now would create a row for a review
      // that may never be written.
      onUploadCompleted: async () => {},
    });

    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not start the upload.' },
      { status: 400 },
    );
  }
}
