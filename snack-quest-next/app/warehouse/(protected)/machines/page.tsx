import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PackageCheck, PackageSearch } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { restockCommandCenterService } from '@/services/restockCommandCenterService';
import { restockTaskRepository } from '@/repositories/restockTaskRepository';
import { machineRepository } from '@/repositories/machineRepository';
import { resolveVendingProductNames } from '@/lib/vending/productNames';
import { serializeRestockTask } from '@/lib/vending/serialize';
import { BUSINESS_TIME_ZONE } from '@/lib/vending/businessClock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { RestockTaskActions } from '@/components/admin/RestockTaskActions';
import { RestockTaskStatusBadge } from '@/components/admin/RestockTaskStatusBadge';
import { CreateRestockTaskButton } from '@/components/admin/CreateRestockTaskButton';

export const metadata: Metadata = { title: 'Machine restocks' };

const opened = new Intl.DateTimeFormat('en-KE', { timeZone: BUSINESS_TIME_ZONE, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * The warehouse's machine work in one place: restocks already under way
 * (pick → dispatch → in transit → receive, each a button here), and the
 * slots about to run out that don't have one yet. Until now this lived
 * only in Admin, which warehouse staff can't open.
 */
export default async function WarehouseMachinesPage() {
  const session = await requireStaffSession();
  if (!hasPermission(session, 'restock.view')) redirect('/warehouse');
  const canPlan = hasPermission(session, 'restock.plan');

  const [open, atRisk] = await Promise.all([
    restockTaskRepository.listOpenByBusiness(session.businessId),
    restockCommandCenterService.getAtRiskSlots(session.businessId),
  ]);
  const machineIds = [...new Set(open.map(({ data }) => data.machineId))];
  const [machines, names] = await Promise.all([
    Promise.all(machineIds.map((id) => machineRepository.findById(session.businessId, id))),
    resolveVendingProductNames(session.businessId, atRisk.map((row) => row.productId).filter((id): id is string => Boolean(id))),
  ]);
  const codes = new Map(machineIds.map((id, index) => [id, machines[index]?.machineCode ?? id]));
  const tasks = [...open].sort((a, b) => a.data.createdAt.toMillis() - b.data.createdAt.toMillis());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Machine restocks</h1>
        <p className="text-sm text-muted-foreground">
          {tasks.length} restock{tasks.length === 1 ? '' : 's'} under way · {atRisk.length} slot{atRisk.length === 1 ? '' : 's'} running low
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Under way</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {tasks.length === 0 ? (
            <EmptyState icon={PackageCheck} title="No restocks under way" description="Approved restocks appear here to pick, dispatch and receive." />
          ) : (
            <ul>
              {tasks.map(({ id, data }) => (
                <li key={id} className="flex flex-col gap-3 border-t border-border px-6 py-4 first:border-t-0 md:flex-row md:items-start md:justify-between">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{codes.get(data.machineId)}</span>
                      <RestockTaskStatusBadge status={data.status} />
                      <span className="text-xs text-muted-foreground">opened {opened.format(data.createdAt.toDate())}</span>
                    </div>
                    <ul className="text-sm text-muted-foreground">
                      {data.items.map((item) => (
                        <li key={item.slotId}>
                          Slot {item.slotId}: {item.quantityNeeded} needed
                          {item.quantityDispatched !== null ? `, ${item.quantityDispatched} sent` : ''}
                          {item.quantityReceived !== null ? `, ${item.quantityReceived} received` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <RestockTaskActions taskId={id} task={serializeRestockTask(id, data)} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Running low</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {atRisk.length === 0 ? (
            <EmptyState icon={PackageSearch} title="Nothing running low" description="Every selling machine has at least a week of stock at its current pace." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th scope="col" className="px-6 py-3 font-medium">Machine</th>
                    <th scope="col" className="px-6 py-3 font-medium">Product</th>
                    <th scope="col" className="px-6 py-3 text-right font-medium">In slot</th>
                    <th scope="col" className="px-6 py-3 text-right font-medium">Days left</th>
                    <th scope="col" className="px-6 py-3 text-right font-medium">Bring</th>
                    <th scope="col" className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {atRisk.map((row) => (
                    <tr key={`${row.machineId}:${row.slotCode}`} className="border-b border-border last:border-0">
                      <td className="px-6 py-3">
                        <span className="font-medium text-foreground">{row.machineCode}</span>
                        <p className="text-xs text-muted-foreground">{row.venueName ?? ''}</p>
                      </td>
                      <td className="px-6 py-3 text-foreground">
                        {(row.productId && names.get(row.productId)) ?? row.productId}
                        <p className="text-xs text-muted-foreground">Slot {row.slotCode}</p>
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-muted-foreground">{row.currentQuantity}/{row.capacity}</td>
                      <td className={`px-6 py-3 text-right tabular-nums font-medium ${row.daysOfStockRemaining <= 1 ? 'text-danger' : 'text-warning'}`}>{row.daysOfStockRemaining}</td>
                      <td className="px-6 py-3 text-right tabular-nums font-semibold text-foreground">{row.recommendedQuantity}</td>
                      <td className="px-6 py-3">{canPlan ? <CreateRestockTaskButton machineId={row.machineId} slotId={row.slotCode} recommendedQuantity={row.recommendedQuantity} /> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
