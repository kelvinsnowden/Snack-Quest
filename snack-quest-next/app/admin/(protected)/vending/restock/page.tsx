import type { Metadata } from 'next';
import Link from 'next/link';
import { PackageSearch } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { restockCommandCenterService } from '@/services/restockCommandCenterService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { CreateRestockTaskButton } from '@/components/admin/CreateRestockTaskButton';

export const metadata: Metadata = { title: 'Restock Command Center' };

/**
 * § PART 3 — RESTOCK COMMAND CENTER. Fleet-wide triage, sorted by
 * urgency (least days of stock remaining first). See
 * `restockCommandCenterService`'s own doc comment for why this reads
 * the same live formula a stored recommendation would, rather than
 * a possibly-stale list of recommendations that happen to already
 * exist. The rest of the workflow — approve, pick, dispatch, transit,
 * receive — continues on each machine's own detail page once a task
 * exists here.
 */
export default async function AdminVendingRestockPage() {
  const session = await requireStaffSession();
  const rows = await restockCommandCenterService.getAtRiskSlots(session.businessId);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Restock Command Center</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length === 0 ? 'No slot is at risk of running out.' : `${rows.length} slot${rows.length === 1 ? '' : 's'} at risk, most urgent first.`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">At-risk slots</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState icon={PackageSearch} title="Nothing to restock" description="Every active machine's own measured velocity says it has enough stock for at least a week." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Machine</th>
                    <th className="px-6 py-3 font-medium">SKU / Slot</th>
                    <th className="px-6 py-3 font-medium">Current</th>
                    <th className="px-6 py-3 font-medium">Baseline</th>
                    <th className="px-6 py-3 font-medium">Stock gap</th>
                    <th className="px-6 py-3 font-medium">Velocity</th>
                    <th className="px-6 py-3 font-medium">Days remaining</th>
                    <th className="px-6 py-3 font-medium">Recommended qty</th>
                    <th className="px-6 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.machineId}:${row.slotCode}`} className={`border-b border-border last:border-0 ${row.daysOfStockRemaining <= 1 ? 'bg-danger/5' : ''}`}>
                      <td className="px-6 py-3">
                        <Link href={`/admin/vending/${row.machineId}`} className="font-medium text-primary hover:underline">
                          {row.machineCode}
                        </Link>
                        <p className="text-xs text-muted-foreground">{row.venueName ?? '—'}</p>
                      </td>
                      <td className="px-6 py-3 text-foreground">
                        {row.productId}
                        <p className="text-xs text-muted-foreground">Slot {row.slotCode}</p>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{row.currentQuantity}</td>
                      <td className="px-6 py-3 text-muted-foreground">{row.capacity}</td>
                      <td className="px-6 py-3 text-muted-foreground">{row.capacity - row.currentQuantity}</td>
                      <td className="px-6 py-3 text-muted-foreground">{row.velocityPerDay}/day</td>
                      <td className={`px-6 py-3 font-medium ${row.daysOfStockRemaining <= 1 ? 'text-danger' : 'text-warning'}`}>{row.daysOfStockRemaining}d</td>
                      <td className="px-6 py-3 font-semibold text-foreground">{row.recommendedQuantity}</td>
                      <td className="px-6 py-3">
                        <CreateRestockTaskButton machineId={row.machineId} slotId={row.slotCode} recommendedQuantity={row.recommendedQuantity} />
                      </td>
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
