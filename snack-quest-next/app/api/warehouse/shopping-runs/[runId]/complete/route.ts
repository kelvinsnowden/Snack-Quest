import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { shoppingRunService, ShoppingRunNotFoundError } from '@/services/shoppingRunService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/** Closes a run, or reopens one. Audit-logged, unlike the per-line writes — this is the transition worth being able to look up later. */
function canUseWarehouse(roles: string[]): boolean {
  return roles.some((role) => role === 'warehouse' || role === 'admin' || role === 'super_admin');
}

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!canUseWarehouse(session.roles)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const reopen = new URL(request.url).searchParams.get('reopen') === 'true';
  const { runId } = await params;

  try {
    if (reopen) {
      await shoppingRunService.reopenRun(session.businessId, runId, session.uid);
    } else {
      await shoppingRunService.completeRun(session.businessId, runId, session.uid);
    }

    const run = await shoppingRunService.getRun(session.businessId, runId);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: reopen ? 'shopping_run.reopen' : 'shopping_run.complete',
      entityType: 'shoppingRun',
      entityId: runId,
      after: { expectedTotalKes: run.expectedTotalKes, actualTotalKes: run.actualTotalKes },
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ShoppingRunNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
