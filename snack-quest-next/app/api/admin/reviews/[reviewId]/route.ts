import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { revalidateTag } from 'next/cache';
import { REVIEWS_CACHE_TAG } from '@/lib/marketing/publishedReviews';
import { reviewService, ReviewNotFoundError } from '@/services/reviewService';

/**
 * `PATCH /api/admin/reviews/{reviewId}` (§ Admin: Reviews) — approve a
 * review onto the homepage, or reject it. The only way a review
 * becomes publicly visible.
 *
 * Rejecting also deletes the submitted photos (see
 * `ReviewService.moderate`), which is why this is a real staff-session
 * route rather than anything lighter.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ reviewId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const { reviewId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { status } = (body ?? {}) as { status?: unknown };
  if (status !== 'published' && status !== 'rejected') {
    return Response.json(
      { error: "status must be 'published' or 'rejected'" },
      { status: 400 },
    );
  }

  try {
    await reviewService.moderate(
      session.businessId,
      reviewId,
      status,
      session.uid,
    );
    /*
     * Publish means publish (§ site load time).
     *
     * The public pages read reviews through a cross-request cache, so
     * without this a review approved here would sit invisible for up
     * to five minutes while an admin refreshed the homepage wondering
     * what they had done wrong. Rejection purges for the same reason
     * in reverse: a review taken down should be gone the moment it is
     * taken down.
     *
     * `{ expire: 0 }` rather than the recommended `'max'`, which is
     * stale-while-revalidate: that serves the old set once more while
     * refreshing behind it, so the admin who just approved a review
     * and went to look would still not see it. Expiring outright
     * makes the next request pay one blocking read, which is the
     * right trade for an action somebody took deliberately and is
     * waiting on.
     */
    revalidateTag(REVIEWS_CACHE_TAG, { expire: 0 });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ReviewNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
