import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { vendingReconciliationService } from '@/services/vendingReconciliationService';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/** § PART 4 — CENTRAL PAYMENT RECONCILIATION. See `vendingReconciliationService`'s own doc comment for exactly what this does and does not detect, and why. */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'sales.view')) {
    return forbiddenForPermission('sales.view');
  }

  const summary = await vendingReconciliationService.getReconciliationIssues(session.businessId);
  return Response.json({ summary });
}
