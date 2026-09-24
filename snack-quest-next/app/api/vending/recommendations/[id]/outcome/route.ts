import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { recommendationEngineService, RecommendationNotFoundError, RecommendationNotApprovedError } from '@/services/recommendationEngineService';

/** Recording what actually happened after an approved recommendation was acted on (§ LEARNING FROM RECOMMENDATIONS). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { outcome, outcomeMetrics } = (body ?? {}) as Record<string, unknown>;
  if (typeof outcome !== 'string' || !outcome) {
    return Response.json({ error: 'outcome is required' }, { status: 400 });
  }
  if (outcomeMetrics !== undefined && (typeof outcomeMetrics !== 'object' || outcomeMetrics === null || Array.isArray(outcomeMetrics))) {
    return Response.json({ error: 'outcomeMetrics must be an object when provided' }, { status: 400 });
  }

  try {
    await recommendationEngineService.recordOutcome(session.businessId, id, outcome, (outcomeMetrics as Record<string, number | string | null>) ?? {}, session.uid);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof RecommendationNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof RecommendationNotApprovedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
