import Link from 'next/link';
import { areaLabel } from '@/lib/audit/auditFilters';
import { formatDateTime } from '@/lib/orders/format';
import type { AuditLog } from '@/types';

/** What happened to one thing, newest first, from the audit log — shown on its page as "History". */
export function EntityHistory({ logs, actorNames, moreHref }: { logs: { id: string; data: AuditLog }[]; actorNames: Map<string, string>; moreHref?: string }) {
  if (logs.length === 0) return <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-border text-sm">
        {logs.map(({ id, data }) => (
          <li key={id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
            <span className="text-foreground">
              {data.action.replace(/_/g, ' ')}
              <span className="text-muted-foreground"> · {areaLabel(data.entityType)}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {data.actorId === 'system' ? 'System' : (actorNames.get(data.actorId) ?? data.actorId)} · {formatDateTime(data.createdAt)}
            </span>
          </li>
        ))}
      </ul>
      {moreHref ? (
        <Link href={moreHref} className="text-sm text-primary hover:underline">
          Everything in the audit log
        </Link>
      ) : null}
    </div>
  );
}
