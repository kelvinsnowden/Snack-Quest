import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { recommendationEngineService, RecommendationNotFoundError, IllegalRecommendationTransitionError } from '@/services/recommendationEngineService';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/** A staff decision not to act on a recommendation — terminal, same as `approve`'s own guarded transition. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'recommendations.act')) {
    return forbiddenForPermission('recommendations.act');
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { actionTaken } = (body ?? {}) as Record<string, unknown>;
  if (typeof actionTaken !== 'string' || !actionTaken) {
    return Response.json({ error: 'actionTaken is required' }, { status: 400 });
  }

  try {
    await recommendationEngineService.dismiss(session.businessId, id, actionTaken, session.uid);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof RecommendationNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof IllegalRecommendationTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
