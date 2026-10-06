import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { staffWith } from '@/lib/ads/routeHelpers';
import { AD_LIMITS, directUploadPrefix } from '@/services/advertisingService';
import { AD_MEDIA_TYPES } from '@/types/advertising';

const VIDEO_TYPES = Object.entries(AD_MEDIA_TYPES)
  .filter(([, kind]) => kind === 'video')
  .map(([type]) => type);
const SAFE_NAME = /^[A-Za-z0-9._-]{1,120}$/;

/**
 * `POST /api/vending/advertising/creatives/direct-upload` (§ AD SECURITY —
 * direct upload): hands the browser a short-lived token to upload one ad
 * video straight to storage, for videos larger than a request through our
 * own server can carry (4.5 MB on Vercel).
 *
 * Fenced like the review-video endpoint, and more: only staff with
 * `advertising.manage` get a token; it allows only MP4/WebM, only up to
 * the direct-upload ceiling (both enforced by storage itself), only under
 * this business's ad folder, with a random suffix so nothing can be
 * overwritten or guessed. The storage write token never leaves the
 * server. The upload alone plays nowhere: it becomes a creative only via
 * `…/creatives/finalize`, which re-checks the stored file, and then only
 * after review.
 *
 * Each token issued is audited. Storage's own completion callback
 * carries no staff session; the library verifies its signature, and
 * nothing is recorded on it.
 */
export async function POST(request: Request): Promise<Response> {
  let body: HandleUploadBody;
  try {
    body = (await request.clone().json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  let businessId: string | null = null;
  let actorId: string | null = null;
  if (body.type === 'blob.generate-client-token') {
    const session = await staffWith(request, ['advertising.manage']);
    if (session instanceof Response) return session;
    businessId = session.businessId;
    actorId = session.uid;
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const prefix = directUploadPrefix(businessId ?? '');
        if (!businessId || !pathname.startsWith(prefix) || !SAFE_NAME.test(pathname.slice(prefix.length))) {
          throw new Error('Upload ad videos into your own ad folder.');
        }
        return {
          allowedContentTypes: VIDEO_TYPES,
          maximumSizeInBytes: AD_LIMITS.maxDirectVideoBytes,
          addRandomSuffix: true,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ businessId }),
        };
      },
      // Nothing is recorded here: the creative is written by `finalize`, after the stored file has been checked.
      onUploadCompleted: async () => {},
    });
    // Who started which upload, so a file that is never finalized can be traced.
    if (businessId && actorId && body.type === 'blob.generate-client-token') {
      await recordAuditLog(request, { businessId, actorId, action: 'ad_creative.direct_upload_started', entityType: 'adCreativeUpload', entityId: body.payload.pathname, after: { pathname: body.payload.pathname } });
    }
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not start the upload.' }, { status: 400 });
  }
}
