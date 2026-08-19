import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { reviewService, ReviewNotFoundError } from '@/services/reviewService';

/**
 * `POST /api/admin/reviews/requests/{orderId}` (§ Mission 2 — review
 * acquisition) — records that a staff member asked this order's
 * customer for a review, which takes them off the "to ask" queue.
 *
 * It records an outreach that already happened by hand; it sends
 * nothing itself. That is the whole design: the messaging integrations
 * are deliberately untouched, so the queue is worked by a person and
 * this route is how they keep score.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const { orderId } = await params;

  try {
    await reviewService.markReviewRequested(session.businessId, orderId, session.uid);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ReviewNotFoundError) {
      return Response.json({ error: 'order not found' }, { status: 404 });
    }
    throw error;
  }
}
