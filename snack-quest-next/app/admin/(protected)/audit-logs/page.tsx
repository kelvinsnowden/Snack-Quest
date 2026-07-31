import type { Metadata } from 'next';
import Link from 'next/link';
import { ScrollText } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { userRepository } from '@/repositories/userRepository';
import { formatDateTime } from '@/lib/orders/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = { title: 'Audit logs' };

const ENTITY_TYPE_FILTERS = ['business', 'package', 'creatorProfile', 'withdrawal', 'marketingSpendEntry', 'storageObject'] as const;

const ENTITY_TYPE_LABELS: Record<(typeof ENTITY_TYPE_FILTERS)[number], string> = {
  business: 'Settings',
  package: 'Products',
  creatorProfile: 'Creators',
  withdrawal: 'Withdrawals',
  marketingSpendEntry: 'Analytics',
  storageObject: 'Storage',
};

export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; cursor?: string }>;
}) {
  const session = await requireStaffSession();
  const { entityType, cursor } = await searchParams;
  const validEntityType = ENTITY_TYPE_FILTERS.includes(entityType as (typeof ENTITY_TYPE_FILTERS)[number])
    ? entityType
    : undefined;

  const { logs, nextCursor } = await auditLogRepository.listByBusiness(session.businessId, {
    entityType: validEntityType,
    cursor,
  });

  const actorIds = Array.from(new Set(logs.map(({ data }) => data.actorId).filter((id) => id !== 'system')));
  const actors = await Promise.all(actorIds.map((id) => userRepository.findById(id)));
  const actorNameById = new Map(actorIds.map((id, index) => [id, actors[index]?.displayName ?? id]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Audit logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every staff-initiated change to this business, newest first.</p>
      </div>

      <Card className="flex flex-wrap gap-2 p-4">
        <Link
          href="/admin/audit-logs"
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            !entityType ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
          }`}
        >
          All
        </Link>
        {ENTITY_TYPE_FILTERS.map((value) => (
          <Link
            key={value}
            href={`/admin/audit-logs?entityType=${value}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              entityType === value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
            }`}
          >
            {ENTITY_TYPE_LABELS[value]}
          </Link>
        ))}
      </Card>

      {logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No audit log entries yet"
          description="Staff actions like editing settings, approving withdrawals, or updating products will show up here."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Entity</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                  <th className="px-4 py-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(({ id, data }) => (
                  <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                    <td className="px-4 py-3 font-medium text-foreground">{data.action}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {data.entityType}
                      <span className="ml-1 text-caption">({data.entityId})</span>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {data.actorId === 'system' ? 'System' : actorNameById.get(data.actorId) ?? data.actorId}
                    </td>
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
            <Link href={`/admin/audit-logs?${entityType ? `entityType=${entityType}&` : ''}cursor=${nextCursor}`}>
              Load more
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
