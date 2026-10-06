import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireWorkspacePage } from '@/lib/auth/requireWorkspacePage';
import { hasPermission } from '@/lib/auth/permissions';
import { machineDealService, MachineDealValidationError } from '@/services/machineDealService';
import { partnerRepository } from '@/repositories/partnerRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatKes } from '@/lib/orders/format';
import { nairobiClock } from '@/lib/ads/playlist';
import { MACHINE_DEAL_MISSING_LABEL } from '@/lib/finance/machineDeal';
import { MACHINE_COST_CATEGORY_GROUP, MACHINE_COST_CATEGORY_LABEL } from '@/types/machineDeal';
import { CancelMachineSaleButton, MachineCostForm, MachineSaleForm, NoInstallationCostToggle, VoidMachineCostButton } from '@/components/finance/MachineDealControls';

export const metadata: Metadata = { title: 'Machine deal' };

/** One machine's costs and sale (§ MACHINE DEALS). Read with `machines.deals.view`; record with `machines.deals.manage`. */
export default async function MachineDealPage({ params }: { params: Promise<{ machineId: string }> }) {
  const session = await requireWorkspacePage('machines.deals.view');
  const canManage = hasPermission(session, 'machines.deals.manage');
  const { machineId } = await params;
  let view;
  try {
    view = await machineDealService.forMachine(session.businessId, machineId);
  } catch (error) {
    if (error instanceof MachineDealValidationError) notFound();
    throw error;
  }
  const partners = await partnerRepository.listByBusiness(session.businessId);
  const ownerName = new Map(partners.map(({ id, data }) => [id, data.name]));
  const today = nairobiClock(new Date()).date;
  const sale = view.deal?.sale ?? null;
  const { summary } = view;

  const row = (label: string, value: string, tone = '') => (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium tabular-nums ${tone}`}>{value}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/finance/machine-deals" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Machine deals
        </Link>
        <h1 className="mt-2 text-page-title font-bold tracking-tight text-foreground">{view.machineCode}</h1>
        <p className="mt-1 text-sm text-muted-foreground">What this machine cost to land and install{sale ? ', what it sold for and what Snack Quest made' : ''}.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Costs</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {view.costs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No costs recorded yet. Start with the purchase price, then shipping, clearing and installation.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {view.costs.map(({ id, data }) => (
                    <li key={id} className={`flex flex-wrap items-start justify-between gap-2 py-2 ${data.voided ? 'opacity-60' : ''}`}>
                      <span>
                        <span className="block text-sm font-medium">
                          {MACHINE_COST_CATEGORY_LABEL[data.category]}
                          <span className="ml-2 text-caption text-muted-foreground">{MACHINE_COST_CATEGORY_GROUP[data.category] === 'landed' ? 'Landed' : 'Installation'}</span>
                        </span>
                        <span className="text-caption text-muted-foreground">
                          {data.occurredOn} · {data.description}
                          {data.voided ? ` · voided: ${data.voided.reason}` : ''}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={`text-sm font-medium tabular-nums ${data.voided ? 'line-through' : ''}`}>{formatKes(data.amountKes)}</span>
                        {canManage && !data.voided ? <VoidMachineCostButton machineId={machineId} costId={id} /> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {canManage ? (
                <div className="flex flex-col gap-4 border-t border-border pt-4">
                  <MachineCostForm machineId={machineId} today={today} />
                  <NoInstallationCostToggle machineId={machineId} value={view.deal?.noInstallationCost ?? false} />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sale to an owner</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {sale ? (
                <>
                  <div className="flex flex-col">
                    {row('Sold on', sale.soldOn)}
                    {row('Sold to', sale.buyerPartnerId ? (ownerName.get(sale.buyerPartnerId) ?? 'An owner') : 'Not in the system')}
                    {row('Machine price', formatKes(sale.machinePriceKes))}
                    {row('Installation charged', sale.installationChargeKes > 0 ? formatKes(sale.installationChargeKes) : 'Included')}
                    {sale.note ? row('Note', sale.note) : null}
                  </div>
                  {canManage ? <CancelMachineSaleButton machineId={machineId} /> : null}
                </>
              ) : canManage ? (
                <MachineSaleForm machineId={machineId} today={today} owners={partners.map(({ id, data }) => ({ id, name: data.name })).sort((a, b) => a.name.localeCompare(b.name))} defaultBuyerId={view.ownerPartnerId} />
              ) : (
                <p className="text-sm text-muted-foreground">Not sold. {view.ownershipType === 'snack_quest' ? 'This is one of Snack Quest’s own machines.' : ''}</p>
              )}
              {view.deal && view.deal.cancelledSales.length > 0 ? (
                <p className="text-caption text-muted-foreground">
                  {view.deal.cancelledSales.length} earlier sale{view.deal.cancelledSales.length === 1 ? ' was' : 's were'} cancelled (kept in the history).
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-4 lg:self-start">
          <CardHeader>
            <CardTitle className="text-base">The numbers</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col">
            {row('Landed cost', summary.landedKes > 0 ? formatKes(summary.landedKes) : 'Not recorded', summary.landedKes > 0 ? '' : 'text-warning')}
            {row('Installation cost', summary.installationKes > 0 ? formatKes(summary.installationKes) : summary.missing.includes('installation_cost') ? 'Not recorded' : 'None', summary.missing.includes('installation_cost') ? 'text-warning' : '')}
            <div className="my-1 border-t border-border" />
            {row('Total cost', formatKes(summary.totalCostKes))}
            {summary.saleRevenueKes !== null ? row('Sold for', formatKes(summary.saleRevenueKes)) : null}
            {summary.saleRevenueKes !== null ? (
              <>
                <div className="my-1 border-t border-border" />
                {summary.profitKes !== null ? (
                  row('Profit', `${formatKes(summary.profitKes)}${summary.marginPct !== null ? ` (${summary.marginPct}%)` : ''}`, summary.profitKes < 0 ? 'text-danger' : 'text-success')
                ) : (
                  <p className="py-1.5 text-sm text-warning">Profit can’t be stated yet: {summary.missing.map((key) => MACHINE_DEAL_MISSING_LABEL[key].toLowerCase()).join(' and ')}.</p>
                )}
              </>
            ) : (
              <p className="pt-2 text-caption text-muted-foreground">Not sold. Its costs count as money invested in Snack Quest’s machines.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
