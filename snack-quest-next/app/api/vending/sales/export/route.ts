import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { vendingSalesService, SalesFilterError, SALES_EXPORT_LIMIT } from '@/services/vendingSalesService';
import { SALE_STATUS_FILTERS } from '@/lib/vending/saleStatus';
import type { MachineTransactionStatus } from '@/types';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/**
 * The sales list as a CSV download, with the same filters as the page
 * (`status`, `machineCode`, `from`, `to` — days in Nairobi time). Carries
 * M-Pesa receipts, so admin and finance only, and every export is
 * audited. Capped at `SALES_EXPORT_LIMIT` rows; the `X-Export-Truncated`
 * header says when more existed.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'sales.export')) {
    return forbiddenForPermission('sales.export');
  }
  const params = new URL(request.url).searchParams;
  const status = params.get('status') || undefined;
  if (status && !SALE_STATUS_FILTERS.includes(status as MachineTransactionStatus)) {
    return Response.json({ error: `status must be one of: ${SALE_STATUS_FILTERS.join(', ')}` }, { status: 400 });
  }
  const filter = {
    status: status as MachineTransactionStatus | undefined,
    machineCode: params.get('machineCode') || undefined,
    from: params.get('from') || undefined,
    to: params.get('to') || undefined,
  };

  try {
    const { csv, rowCount, truncated } = await vendingSalesService.exportCsv(session.businessId, filter);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'export_vending_sales',
      entityType: 'machineTransaction',
      entityId: 'export',
      after: { ...filter, rowCount, truncated },
    });
    const day = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="vending-sales-${day}.csv"`,
        'Cache-Control': 'no-store',
        'X-Export-Row-Count': String(rowCount),
        'X-Export-Truncated': truncated ? `true; limit ${SALES_EXPORT_LIMIT}` : 'false',
      },
    });
  } catch (error) {
    if (error instanceof SalesFilterError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
