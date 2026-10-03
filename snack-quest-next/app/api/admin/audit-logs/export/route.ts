import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { parseAuditFilters, areaLabel } from '@/lib/audit/auditFilters';
import { csvCell } from '@/services/vendingSalesService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

const MAX_ROWS = 5000;
const when = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

/**
 * The audit log as CSV with the same filters as the page (`audit.export`),
 * up to 5,000 entries, newest first. Before/after values are included as
 * JSON. The export itself is audited.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'audit.export')) return forbiddenForPermission('audit.export');
  const filters = await parseAuditFilters(session.businessId, new URL(request.url).searchParams);
  if (filters.unknownMachine) return Response.json({ error: `No machine has the code ${filters.machineCode}.` }, { status: 400 });

  const rows: string[][] = [];
  let cursor: string | undefined;
  let truncated = false;
  for (;;) {
    const page = await auditLogRepository.search(session.businessId, { ...filters, limit: 500, cursor, scanLimit: 5000 });
    for (const { data } of page.logs) {
      rows.push([
        data.createdAt ? when.format(data.createdAt.toDate()).replace(',', '') : '',
        csvCell(data.action),
        csvCell(areaLabel(data.entityType)),
        csvCell(data.entityId),
        csvCell(data.machineId ?? ''),
        csvCell(data.actorId),
        csvCell(data.source ?? 'admin_portal'),
        csvCell(data.ipAddress ?? ''),
        csvCell(data.before ? JSON.stringify(data.before) : ''),
        csvCell(data.after ? JSON.stringify(data.after) : ''),
      ]);
    }
    if (rows.length >= MAX_ROWS) {
      truncated = rows.length > MAX_ROWS || page.nextCursor !== null;
      rows.length = Math.min(rows.length, MAX_ROWS);
      break;
    }
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  const header = ['When (Nairobi)', 'Action', 'Area', 'Entity', 'Machine', 'Actor', 'Source', 'IP', 'Before', 'After'].map(csvCell);
  const csv = [header, ...rows].map((line) => line.join(',')).join('\r\n') + '\r\n';
  await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'export_audit_log', entityType: 'business', entityId: session.businessId, after: { filters: filters.raw, rowCount: rows.length, truncated } });
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="audit-log.csv"', 'Cache-Control': 'no-store', ...(truncated ? { 'X-Truncated': 'true' } : {}) },
  });
}
