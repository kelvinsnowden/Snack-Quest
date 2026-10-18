import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { maintenanceRepository } from '@/repositories/maintenanceRepository';
import { restockTaskRepository } from '@/repositories/restockTaskRepository';
import { machineRepository } from '@/repositories/machineRepository';
import { technicianJobService } from '@/services/technicianJobService';
import { MAINTENANCE_REQUEST_CATEGORY_LABEL, MAINTENANCE_REQUEST_STATUS_LABEL } from '@/types/maintenance';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AssignTechnician } from '@/components/admin/vending/AssignTechnician';

export const metadata: Metadata = { title: 'Technicians' };

/**
 * Who goes where: every open maintenance visit and restock with the
 * person it's given to, and how many jobs each technician has. They see
 * their own jobs, with a checklist, in the Warehouse workspace under
 * "My jobs".
 */
export default async function TechniciansPage() {
  const session = await requireStaffSession();
  const canMaintenance = hasPermission(session, 'maintenance.manage');
  const canRestock = hasPermission(session, 'restock.plan');
  if (!canMaintenance && !canRestock && !hasPermission(session, 'maintenance.view') && !hasPermission(session, 'restock.view')) redirect('/admin');

  const [technicians, jobs, maintenance, restocks, machines] = await Promise.all([
    technicianJobService.listTechnicians(session.businessId),
    technicianJobService.listForBusiness(session.businessId),
    Promise.all((['open', 'acknowledged', 'scheduled'] as const).map((status) => maintenanceRepository.listRequests(session.businessId, { status }))).then((lists) => lists.flat()),
    restockTaskRepository.listOpenByBusiness(session.businessId),
    machineRepository.listAllForBusiness(session.businessId),
  ]);
  const code = new Map(machines.map(({ id, data }) => [id, data.machineCode]));
  const job = new Map(jobs.map((entry) => [entry.id, entry]));
  const forKind = (kind: 'maintenance' | 'restock') => technicians.filter((technician) => technician.kinds.includes(kind)).map(({ uid, name }) => ({ uid, name }));
  const progress = (id: string) => {
    const entry = job.get(id);
    if (!entry || entry.status !== 'assigned') return null;
    return `${entry.checklist.filter((item) => item.done).length}/${entry.checklist.length} checked`;
  };
  const load = new Map<string, number>();
  for (const entry of jobs) if (entry.status === 'assigned' && entry.assigneeUid) load.set(entry.assigneeUid, (load.get(entry.assigneeUid) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Technicians</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Technicians are people who can work maintenance or restocks (set on{' '}
          <Link href="/admin/staff" className="underline">
            Users &amp; permissions
          </Link>
          ). They see their jobs in the Warehouse workspace under My jobs.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {technicians.length === 0 ? <p className="text-sm text-muted-foreground">Nobody can take jobs yet.</p> : null}
        {technicians.map((technician) => (
          <Badge key={technician.uid} variant="outline">
            {technician.name} · {load.get(technician.uid) ?? 0} job{(load.get(technician.uid) ?? 0) === 1 ? '' : 's'}
          </Badge>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Maintenance visits</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {maintenance.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No open maintenance requests.</p>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-6 py-2 font-medium">Machine</th>
                  <th className="px-6 py-2 font-medium">Problem</th>
                  <th className="px-6 py-2 font-medium">Status</th>
                  <th className="px-6 py-2 font-medium">Technician</th>
                </tr>
              </thead>
              <tbody>
                {maintenance.map(({ id, data }) => (
                  <tr key={id} className="border-b border-border align-top last:border-0">
                    <td className="px-6 py-3 font-medium text-foreground">
                      <Link href={`/admin/vending/${data.machineId}`} className="hover:underline">
                        {code.get(data.machineId) ?? data.machineId}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {MAINTENANCE_REQUEST_CATEGORY_LABEL[data.category]}
                      {data.urgency === 'urgent' ? (
                        <Badge variant="danger" className="ml-2">
                          Urgent
                        </Badge>
                      ) : null}
                      <p className="line-clamp-2 text-xs">{data.description}</p>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {MAINTENANCE_REQUEST_STATUS_LABEL[data.status]}
                      {data.scheduledFor ? ` · ${data.scheduledFor}` : ''}
                    </td>
                    <td className="px-6 py-3">
                      <AssignTechnician kind="maintenance" refId={id} current={job.get(`maintenance_${id}`)?.assigneeUid ?? null} technicians={forKind('maintenance')} disabled={!canMaintenance} />
                      {progress(`maintenance_${id}`) ? <p className="mt-1 text-xs text-muted-foreground">{progress(`maintenance_${id}`)}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Restocks</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {restocks.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No restocks under way.</p>
          ) : (
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-6 py-2 font-medium">Machine</th>
                  <th className="px-6 py-2 font-medium">Stage</th>
                  <th className="px-6 py-2 font-medium">Items</th>
                  <th className="px-6 py-2 font-medium">Technician</th>
                </tr>
              </thead>
              <tbody>
                {restocks.map(({ id, data }) => (
                  <tr key={id} className="border-b border-border align-top last:border-0">
                    <td className="px-6 py-3 font-medium text-foreground">{code.get(data.machineId) ?? data.machineId}</td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {data.status.replace('_', ' ')}
                      {data.priority === 'high' ? (
                        <Badge variant="warning" className="ml-2">
                          High
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-6 py-3 tabular-nums text-muted-foreground">{data.items.reduce((sum, item) => sum + item.quantityNeeded, 0)}</td>
                    <td className="px-6 py-3">
                      <AssignTechnician kind="restock" refId={id} current={job.get(`restock_${id}`)?.assigneeUid ?? null} technicians={forKind('restock')} disabled={!canRestock} />
                      {progress(`restock_${id}`) ? <p className="mt-1 text-xs text-muted-foreground">{progress(`restock_${id}`)}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
