import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/auth/requireAdminSection';
import { machineSettlementRepository } from '@/repositories/machineSettlementRepository';
import { machineRepository } from '@/repositories/machineRepository';
import { partnerService } from '@/services/partnerService';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Settlements to finalize' };

const day = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric' });

/** Every draft settlement across all owners — the finance queue. Each opens on its owner's settlement page. */
export default async function SettlementsQueuePage() {
  const session = await requireAdminPage('vending', 'owner_finance.view');
  const [drafts, machines, owners] = await Promise.all([
    machineSettlementRepository.listByStatus(session.businessId, 'draft'),
    machineRepository.listAllForBusiness(session.businessId),
    partnerService.listByBusiness(session.businessId),
  ]);
  const codes = new Map(machines.map(({ id, data }) => [id, data.machineCode]));
  const names = new Map(owners.map(({ id, data }) => [id, data.name]));
  const rows = [...drafts].sort((a, b) => a.data.periodEnd.toMillis() - b.data.periodEnd.toMillis());
  const total = rows.reduce((sum, { data }) => sum + data.distributableOwnerKes + data.adjustmentKes, 0);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settlements to finalize</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} draft{rows.length === 1 ? '' : 's'}, KES {total.toLocaleString('en-KE')} in total, oldest first. To prepare a new one, open the owner.
        </p>
      </div>
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No drafts waiting.</p> : (
            <ul className="divide-y divide-border">
              {rows.map(({ id, data }) => (
                <li key={id}>
                  <Link href={`/admin/vending/partners/${data.partnerId}/settlements`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-border/20 sm:px-6">
                    <span className="flex flex-col">
                      <span className="font-medium text-foreground">{names.get(data.partnerId) ?? data.partnerId} · {codes.get(data.machineId) ?? data.machineId}</span>
                      <span className="text-muted-foreground">{day.format(data.periodStart.toDate())} – {day.format(new Date(data.periodEnd.toMillis() - 1))}</span>
                    </span>
                    <span className="flex items-center gap-2 tabular-nums">
                      KES {(data.distributableOwnerKes + data.adjustmentKes).toLocaleString('en-KE')}
                      {(data.outcomeConflictCount ?? 0) > 0 ? <Badge variant="danger">Sales to resolve</Badge> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
