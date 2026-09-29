import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { parseAuditFilters } from '@/lib/audit/auditFilters';

/** Lists this business's staff-action trail (§ Admin: Audit Logs), newest first, optionally filtered to one entity type. */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'audit.view')) {
    return forbiddenForPermission('audit.view');
  }

  // Same filters as the page: area, actor, machine (code), from, to. `entityType` is the older name for area.
  const query = new URL(request.url).searchParams;
  if (!query.get('area') && query.get('entityType')) query.set('area', query.get('entityType')!);
  const filters = await parseAuditFilters(session.businessId, query);
  if (filters.unknownMachine) {
    return Response.json({ error: `No machine has the code ${filters.machineCode}.` }, { status: 400 });
  }
  const { logs, nextCursor } = await auditLogRepository.search(session.businessId, { ...filters, cursor: query.get('cursor') ?? undefined });

  return Response.json({
    logs: logs.map(({ id, data }) => ({ id, ...data })),
    nextCursor,
  });
}
