import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { vendingReconciliationService } from '@/services/vendingReconciliationService';

/** § PART 4 — CENTRAL PAYMENT RECONCILIATION. See `vendingReconciliationService`'s own doc comment for exactly what this does and does not detect, and why. */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const summary = await vendingReconciliationService.getReconciliationIssues(session.businessId);
  return Response.json({ summary });
}
