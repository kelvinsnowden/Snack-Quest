import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
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
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ReviewNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
