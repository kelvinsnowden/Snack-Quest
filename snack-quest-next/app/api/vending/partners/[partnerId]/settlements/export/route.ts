import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { machineSettlementService } from '@/services/machineSettlementService';
import { partnerService } from '@/services/partnerService';
import { machineRepository } from '@/repositories/machineRepository';
import { csvCell } from '@/services/vendingSalesService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { BUSINESS_TIME_ZONE } from '@/lib/vending/businessClock';

const day = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** One owner's settlements as CSV (`owner_finance.view`), every figure as stored — for the owner's records or the accountant. The export itself is audited. */
export async function GET(request: Request, { params }: { params: Promise<{ partnerId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'owner_finance.view')) return forbiddenForPermission('owner_finance.view');
  const { partnerId } = await params;
  const partner = await partnerService.findById(session.businessId, partnerId);
  if (!partner) return Response.json({ error: 'Owner not found' }, { status: 404 });

  const [rows, machines] = await Promise.all([machineSettlementService.listByPartner(session.businessId, partnerId), machineRepository.listByPartner(session.businessId, partnerId)]);
  const codes = new Map(machines.map(({ id, data }) => [id, data.machineCode]));
  const header = ['Settlement', 'Machine', 'First day', 'Last day', 'Status', 'Gross sales KES', 'Refunds KES', 'Cost of goods KES', 'Sales without a cost', 'Subscription KES', 'Adjustment KES', 'Adjustment reason', 'Credited to owner KES', 'Finalized'];
  const lines = rows.map(({ id, data }) => [
    csvCell(id),
    csvCell(codes.get(data.machineId) ?? data.machineId),
    day.format(data.periodStart.toDate()),
    // Periods end at 00:00 after their last day; show the last day itself.
    day.format(new Date(data.periodEnd.toMillis() - 1)),
    data.status,
    String(data.grossSalesKes),
    String(data.refundsKes),
    String(data.cogsKes),
    String(data.unpricedSaleCount),
    String(data.subscriptionChargedKes),
    String(data.adjustmentKes),
    csvCell(data.adjustmentReason ?? ''),
    // What finalize credits (or would credit, for a draft).
    String(data.distributableOwnerKes + data.adjustmentKes),
    data.finalizedAt ? day.format(data.finalizedAt.toDate()) : '',
  ]);
  const csv = [header.map(csvCell), ...lines].map((line) => line.join(',')).join('\r\n') + '\r\n';
  await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'export_owner_settlements', entityType: 'partner', entityId: partnerId, after: { rowCount: rows.length } });
  const safeName = partner.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'owner';
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="settlements-${safeName}.csv"`, 'Cache-Control': 'no-store' } });
}
