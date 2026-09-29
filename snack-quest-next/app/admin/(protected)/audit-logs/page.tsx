import type { Metadata } from 'next';
import Link from 'next/link';
import { ScrollText } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { userRepository } from '@/repositories/userRepository';
import { formatDateTime } from '@/lib/orders/format';
import { staffManagementService } from '@/services/staffManagementService';
import { hasPermission } from '@/lib/auth/permissions';
import { parseAuditFilters, auditFilterQuery, AUDIT_AREAS, areaLabel } from '@/lib/audit/auditFilters';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = { title: 'Audit logs' };

export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireStaffSession();
  const params = await searchParams;
  const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  // Older links used ?entityType=; treat it as the area.
  if (!query.get('area') && query.get('entityType')) query.set('area', query.get('entityType')!);
  const filters = await parseAuditFilters(session.businessId, query);
  const cursor = query.get('cursor') ?? undefined;

  const [{ logs, nextCursor, scanCapped }, staff] = await Promise.all([
    filters.unknownMachine ? Promise.resolve({ logs: [], nextCursor: null, scanCapped: false }) : auditLogRepository.search(session.businessId, { ...filters, cursor }),
    staffManagementService.listStaff(session.businessId),
  ]);

  const staffNames = new Map(staff.map((member) => [member.uid, member.displayName !== 'Unknown' ? member.displayName : member.email]));
  const actorIds = Array.from(new Set(logs.map(({ data }) => data.actorId).filter((id) => id !== 'system' && !staffNames.has(id))));
  const actors = await Promise.all(actorIds.map((id) => userRepository.findById(id)));
  const actorNameById = new Map([...staffNames, ...actorIds.map((id, index) => [id, actors[index]?.displayName ?? id] as [string, string])]);
  const filterQuery = auditFilterQuery(filters.raw);
  const field = 'h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Audit logs</h1>
          <p className="hidden sm:block mt-1 text-sm text-muted-foreground">Every staff-initiated change to this business, newest first.</p>
        </div>
        {hasPermission(session, 'audit.export') ? (
          <Button asChild variant="outline">
            <a href={`/api/admin/audit-logs/export${filterQuery ? `?${filterQuery}` : ''}`}>Download CSV</a>
          </Button>
        ) : null}
      </div>

      <Card className="p-4">
        <form action="/admin/audit-logs" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Area
            <select name="area" defaultValue={filters.raw.area} className={field}>
              <option value="">Everything</option>
              {Object.entries(AUDIT_AREAS)
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Person
            <select name="actor" defaultValue={filters.raw.actor} className={field}>
              <option value="">Anyone</option>
              <option value="system">System</option>
              {[...staff].sort((a, b) => (staffNames.get(a.uid) ?? '').localeCompare(staffNames.get(b.uid) ?? '')).map((member) => <option key={member.uid} value={member.uid}>{staffNames.get(member.uid)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Machine code
            <input name="machine" defaultValue={filters.raw.machine} placeholder="SQ-MCH-000001" className={`${field} w-40`} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            From
            <input type="date" name="from" defaultValue={filters.raw.from} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            To
            <input type="date" name="to" defaultValue={filters.raw.to} className={field} />
          </label>
          <Button type="submit">Show</Button>
          {filterQuery ? <Link href="/admin/audit-logs" className="pb-2 text-sm text-primary hover:underline">Clear</Link> : null}
        </form>
        {filters.unknownMachine ? <p className="mt-3 text-sm text-danger">No machine has the code {filters.machineCode}.</p> : null}
        {scanCapped ? <p className="mt-3 text-sm text-muted-foreground">Only part of the log was searched for this combination. Use “Load more” to keep looking, or narrow the dates.</p> : null}
      </Card>

      {logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={filterQuery ? 'Nothing matches these filters' : 'No audit log entries yet'}
          description={filterQuery ? 'Try a wider date range or a different area.' : 'Staff actions like editing settings, approving withdrawals, or updating products will show up here.'}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Entity</th>
                  <th className="px-4 py-3 font-medium">Machine</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                  <th className="px-4 py-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(({ id, data }) => (
                  <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                    <td className="px-4 py-3 font-medium text-foreground">{data.action}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {areaLabel(data.entityType)}
                      <span className="ml-1 text-caption">({data.entityId})</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{data.machineId ?? '—'}</td>
                    <td className="px-4 py-3 text-foreground">
                      {data.actorId === 'system' ? 'System' : actorNameById.get(data.actorId) ?? data.actorId}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{data.source ?? 'admin_portal'}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{data.ipAddress}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{formatDateTime(data.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href={`/admin/audit-logs?${filterQuery ? `${filterQuery}&` : ''}cursor=${nextCursor}`}>
              Load more
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
