import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { saleTraceService, type SaleTraceQuery } from '@/services/saleTraceService';

/**
 * GET — trace a sale end to end ("customer paid at 14:32, no snack").
 * Exactly one of: `transactionId`, `transactionRef`, `paymentRef` (the
 * M-Pesa receipt), `checkoutRequestId`, `commandRef`, or `machineCode`
 * with `at` (ISO time) and optional `windowMinutes` (default 15, max 120).
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const params = new URL(request.url).searchParams;
  const query = parseQuery(params);
  if (!query) {
    return Response.json(
      { error: 'Give exactly one of transactionId, transactionRef, paymentRef, checkoutRequestId, commandRef — or machineCode with at (an ISO time).' },
      { status: 400 },
    );
  }
  const sales = await saleTraceService.trace(session.businessId, query);
  return Response.json({ sales });
}

function parseQuery(params: URLSearchParams): SaleTraceQuery | null {
  const keys = ['transactionId', 'transactionRef', 'paymentRef', 'checkoutRequestId', 'commandRef'] as const;
  const given = keys.filter((key) => params.get(key)?.trim());
  const machineCode = params.get('machineCode')?.trim();
  if (given.length + (machineCode ? 1 : 0) !== 1) {
    return null;
  }
  if (given.length === 1) {
    const key = given[0];
    return { [key]: params.get(key)!.trim() } as SaleTraceQuery;
  }
  const at = new Date(params.get('at') ?? '');
  if (Number.isNaN(at.getTime())) {
    return null;
  }
  const windowMinutes = Number(params.get('windowMinutes') ?? 15);
  return { machineCode: machineCode!, at, windowMinutes: Number.isFinite(windowMinutes) ? windowMinutes : 15 };
}
