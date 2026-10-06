import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/auth/requireAdminSection';
import { hasPermission } from '@/lib/auth/permissions';
import { maintenanceService } from '@/services/maintenanceService';
import { machineRepository } from '@/repositories/machineRepository';
import { nairobiClock } from '@/lib/ads/playlist';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CostForm, NewRequestForm, RequestActions, VoidCostButton, type MachineOption } from '@/components/admin/vending/MaintenanceControls';
import {
  MAINTENANCE_COST_CATEGORY_LABEL,
  MAINTENANCE_REQUEST_CATEGORY_LABEL,
  MAINTENANCE_REQUEST_STATUS_LABEL,
  type MaintenanceRequestStatus,
} from '@/types/maintenance';

export const metadata: Metadata = { title: 'Maintenance' };

const OPEN: MaintenanceRequestStatus[] = ['open', 'acknowledged', 'scheduled'];
const STATUS_TONE: Record<MaintenanceRequestStatus, string> = {
  open: 'bg-warning/15 text-warning',
  acknowledged: 'bg-primary/10 text-primary',
  scheduled: 'bg-primary/10 text-primary',
  resolved: 'bg-success/15 text-success',
  cancelled: 'bg-muted/20 text-muted-foreground',
};
const VIEWS = { active: 'Needs work', closed: 'Fixed or cancelled', all: 'Everything' } as const;
type View = keyof typeof VIEWS;

const kes = (value: number) => `KES ${value.toLocaleString('en-KE')}`;
const when = (value: string | null) => (value ? new Date(value).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' }) : '—');

/**
 * Machine maintenance (§ MAINTENANCE): problems reported by owners and
 * staff, worked through to fixed, and what fixing them cost. Each part
 * appears only to people whose permissions allow it.
 */
export default async function MaintenancePage({ searchParams }: { searchParams: Promise<{ view?: string; machineId?: string }> }) {
  const session = await requireAdminPage('vending', 'maintenance.view');
  const canManage = hasPermission(session, 'maintenance.manage');
  const canRecord = hasPermission(session, 'maintenance.costs.record');
  const params = await searchParams;
  const view: View = params.view === 'closed' || params.view === 'all' ? params.view : 'active';
  const machineFilter = params.machineId || undefined;

  const [machineRows, requestRows, costRows] = await Promise.all([
    machineRepository.listAllForBusiness(session.businessId),
    maintenanceService.listRequests(session.businessId, { machineId: machineFilter }),
    machineFilter ? maintenanceService.listCostsForMachine(session.businessId, machineFilter) : maintenanceService.listRecentCosts(session.businessId, 100),
  ]);
  const machines: MachineOption[] = machineRows
    .filter(({ data }) => data.status !== 'decommissioned')
    .map(({ id, data }) => ({ id, code: data.machineCode, hasOwner: Boolean(data.ownerPartnerId) }))
    .sort((a, b) => a.code.localeCompare(b.code));
  const codeOf = new Map(machineRows.map(({ id, data }) => [id, data.machineCode]));
  const requests = requestRows.filter(({ data }) => (view === 'all' ? true : view === 'active' ? OPEN.includes(data.status) : !OPEN.includes(data.status)));
  const openCount = requestRows.filter(({ data }) => OPEN.includes(data.status)).length;
  const urgentCount = requestRows.filter(({ data }) => OPEN.includes(data.status) && data.urgency === 'urgent').length;

  const today = nairobiClock(new Date()).date;
  const monthPrefix = today.slice(0, 7);
  const thisMonth = costRows.filter(({ data }) => !data.voided && data.occurredOn.startsWith(monthPrefix));
  const monthBy = (payer: 'snack_quest' | 'owner') => thisMonth.filter(({ data }) => data.paidBy === payer).reduce((sum, { data }) => sum + data.amountKes, 0);
  const linkable = requestRows.filter(({ data }) => data.status !== 'cancelled').map(({ id, data }) => ({ id, machineId: data.machineId, label: `${MAINTENANCE_REQUEST_CATEGORY_LABEL[data.category]} · ${data.createdAt.toDate().toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi' })}` }));
  const href = (next: Partial<{ view: View; machineId: string }>) => {
    const query = new URLSearchParams();
    const v = next.view ?? view;
    if (v !== 'active') query.set('view', v);
    const m = 'machineId' in next ? next.machineId : machineFilter;
    if (m) query.set('machineId', m);
    const text = query.toString();
    return `/admin/vending/maintenance${text ? `?${text}` : ''}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-page-title font-semibold text-foreground">Maintenance</h1>
        <p className="text-sm text-muted-foreground">
          {openCount === 0 ? 'Nothing waiting.' : `${openCount} problem${openCount === 1 ? '' : 's'} waiting${urgentCount ? `, ${urgentCount} urgent` : ''}.`}
          {machineFilter ? (
            <>
              {' '}
              Showing {codeOf.get(machineFilter) ?? 'one machine'} only. <Link className="underline" href={href({ machineId: undefined })}>Show all machines</Link>
            </>
          ) : null}
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <CardTitle className="text-base">Problems</CardTitle>
          <nav aria-label="Which problems" className="flex flex-wrap gap-2 text-sm">
            {(Object.keys(VIEWS) as View[]).map((key) => (
              <Link key={key} href={href({ view: key })} aria-current={key === view ? 'page' : undefined} className={`rounded-full px-3 py-1 ${key === view ? 'bg-primary text-primary-foreground' : 'bg-border/40 text-foreground'}`}>
                {VIEWS[key]}
              </Link>
            ))}
          </nav>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {requests.length === 0 ? <p className="text-sm text-muted-foreground">No problems here.</p> : null}
          <ul className="flex flex-col divide-y divide-border">
            {requests.map(({ id, data }) => (
              <li key={id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-caption font-medium ${STATUS_TONE[data.status]}`}>{MAINTENANCE_REQUEST_STATUS_LABEL[data.status]}</span>
                  {data.urgency === 'urgent' ? <span className="rounded-full bg-danger/10 px-2 py-0.5 text-caption font-medium text-danger">Urgent</span> : null}
                  <Link className="font-medium underline-offset-2 hover:underline" href={`/admin/vending/${data.machineId}`}>
                    {codeOf.get(data.machineId) ?? data.machineId}
                  </Link>
                  <span className="text-muted-foreground">· {MAINTENANCE_REQUEST_CATEGORY_LABEL[data.category]}</span>
                  <span className="text-muted-foreground">· reported by {data.raisedBy.kind === 'owner' ? 'the owner' : 'staff'} {when(data.createdAt.toDate().toISOString())}</span>
                </div>
                <p className="max-w-prose text-sm text-foreground">{data.description}</p>
                {data.scheduledFor && data.status === 'scheduled' ? <p className="text-sm text-muted-foreground">Visit on {data.scheduledFor}.</p> : null}
                {data.resolution ? <p className="text-sm text-muted-foreground">Outcome: {data.resolution}</p> : null}
                {canManage ? <RequestActions requestId={id} status={data.status} /> : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Log a problem</CardTitle>
          </CardHeader>
          <CardContent>
            <NewRequestForm machines={machines} defaultMachineId={machineFilter} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-1">
          <CardTitle className="text-base">Costs</CardTitle>
          <p className="text-sm text-muted-foreground tabular-nums">
            This month{machineFilter ? '' : ' (of the latest 100)'}: Snack Quest {kes(monthBy('snack_quest'))} · owners {kes(monthBy('owner'))}. Each machine’s P&amp;L counts the costs in its period.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {canRecord ? <CostForm machines={machines} requests={linkable} today={today} defaultMachineId={machineFilter} /> : null}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-caption uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Machine</th>
                  <th className="py-2 pr-4">What</th>
                  <th className="py-2 pr-4">Paid by</th>
                  <th className="py-2 pr-4 text-right">Amount</th>
                  {canRecord ? <th className="py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {costRows.length === 0 ? (
                  <tr>
                    <td colSpan={canRecord ? 6 : 5} className="py-3 text-muted-foreground">
                      No costs recorded.
                    </td>
                  </tr>
                ) : null}
                {costRows.map(({ id, data }) => (
                  <tr key={id} className={`border-b border-border/60 ${data.voided ? 'text-muted-foreground line-through' : ''}`}>
                    <td className="py-2 pr-4 tabular-nums">{data.occurredOn}</td>
                    <td className="py-2 pr-4">{codeOf.get(data.machineId) ?? data.machineId}</td>
                    <td className="py-2 pr-4">
                      {MAINTENANCE_COST_CATEGORY_LABEL[data.category]}: {data.description}
                      {data.vendor ? ` (${data.vendor})` : ''}
                      {data.voided ? <span className="block no-underline">Voided: {data.voided.reason}</span> : null}
                    </td>
                    <td className="py-2 pr-4">{data.paidBy === 'owner' ? 'Owner' : 'Snack Quest'}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{kes(data.amountKes)}</td>
                    {canRecord ? <td className="py-2 text-right">{data.voided ? null : <VoidCostButton costId={id} />}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
