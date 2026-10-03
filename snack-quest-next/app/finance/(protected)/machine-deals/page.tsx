import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requireWorkspacePage } from '@/lib/auth/requireWorkspacePage';
import { machineDealService } from '@/services/machineDealService';
import { partnerRepository } from '@/repositories/partnerRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatKes } from '@/lib/orders/format';
import { MACHINE_DEAL_MISSING_LABEL } from '@/lib/finance/machineDeal';
import { MACHINE_OWNERSHIP_LABEL, type MachineOwnershipType } from '@/types';

export const metadata: Metadata = { title: 'Machine deals' };

/**
 * The machines themselves as money (§ MACHINE DEALS): what each cost to
 * land and install, what the ones sold to owners sold for, and the profit.
 * Snack Quest's own unsold machines are money invested, shown on its own.
 */
export default async function MachineDealsPage() {
  const session = await requireWorkspacePage('machines.deals.view');
  const [rows, partners] = await Promise.all([machineDealService.forFleet(session.businessId), partnerRepository.listByBusiness(session.businessId)]);
  const ownerName = new Map(partners.map(({ id, data }) => [id, data.name]));
  const sold = rows.filter((row) => row.deal?.sale);
  const unsold = rows.filter((row) => !row.deal?.sale);
  const soldComplete = sold.filter((row) => row.summary.profitKes !== null);
  const totals = {
    soldRevenue: sold.reduce((sum, row) => sum + (row.summary.saleRevenueKes ?? 0), 0),
    soldProfit: soldComplete.reduce((sum, row) => sum + (row.summary.profitKes ?? 0), 0),
    invested: unsold.reduce((sum, row) => sum + row.summary.totalCostKes, 0),
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Machine deals</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          What each machine cost to land and install, what it sold for and what Snack Quest made. This is the machines themselves, not the snacks they sell. A cost
          nobody has recorded shows as missing, never as zero.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-1 p-5">
            <span className="text-sm text-muted-foreground">Machines sold</span>
            <span className="text-2xl font-bold tabular-nums">{formatKes(totals.soldRevenue)}</span>
            <span className="text-caption text-muted-foreground">{sold.length} machine{sold.length === 1 ? '' : 's'}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-5">
            <span className="text-sm text-muted-foreground">Profit on machines sold</span>
            <span className={`text-2xl font-bold tabular-nums ${totals.soldProfit < 0 ? 'text-danger' : ''}`}>{formatKes(totals.soldProfit)}</span>
            <span className="text-caption text-muted-foreground">
              {soldComplete.length} of {sold.length} with every cost recorded
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-5">
            <span className="text-sm text-muted-foreground">Invested in machines not sold</span>
            <span className="text-2xl font-bold tabular-nums">{formatKes(totals.invested)}</span>
            <span className="text-caption text-muted-foreground">Landed and installation cost recorded so far</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Every machine</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border text-left text-caption uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Machine</th>
                <th className="px-4 py-2 text-right font-medium">Landed</th>
                <th className="px-4 py-2 text-right font-medium">Installation</th>
                <th className="px-4 py-2 text-right font-medium">Sold for</th>
                <th className="px-4 py-2 text-right font-medium">Profit</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.machineId}>
                  <td className="px-4 py-3">
                    <span className="block font-medium">{row.machineCode}</span>
                    <span className="text-caption text-muted-foreground">
                      {row.deal?.sale
                        ? `Sold ${row.deal.sale.soldOn}${row.deal.sale.buyerPartnerId ? ` to ${ownerName.get(row.deal.sale.buyerPartnerId) ?? 'an owner'}` : ''}`
                        : row.ownershipType
                          ? MACHINE_OWNERSHIP_LABEL[row.ownershipType as MachineOwnershipType]
                          : 'Not sold'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.summary.landedKes > 0 ? formatKes(row.summary.landedKes) : <span className="text-warning">Missing</span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.summary.installationKes > 0 ? formatKes(row.summary.installationKes) : row.summary.missing.includes('installation_cost') ? <span className="text-warning">Missing</span> : 'None'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.summary.saleRevenueKes !== null ? formatKes(row.summary.saleRevenueKes) : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.summary.profitKes !== null ? (
                      <span className={row.summary.profitKes < 0 ? 'text-danger' : 'text-success'}>
                        {formatKes(row.summary.profitKes)}
                        {row.summary.marginPct !== null ? <span className="block text-caption text-muted-foreground">{row.summary.marginPct}%</span> : null}
                      </span>
                    ) : row.deal?.sale ? (
                      <span className="text-caption text-warning">{row.summary.missing.map((key) => MACHINE_DEAL_MISSING_LABEL[key]).join(' · ')}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/finance/machine-deals/${row.machineId}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                      Open <ChevronRight className="size-4" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
