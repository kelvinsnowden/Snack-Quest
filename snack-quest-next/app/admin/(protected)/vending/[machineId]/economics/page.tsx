import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireAdminPage } from '@/lib/auth/requireAdminSection';
import { hasPermission } from '@/lib/auth/permissions';
import { machineService } from '@/services/machineService';
import { machineEconomicProfileService } from '@/services/machineEconomicProfileService';
import { machinePnlService } from '@/services/machinePnlService';
import { stockTransferRepository } from '@/repositories/stockTransferRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
import { PERIOD_PRESETS, PERIOD_PRESET_LABEL, resolvePeriod } from '@/lib/finance/periods';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { OwnershipTypeControl } from '@/components/admin/vending/EconomicsControls';
import { MACHINE_OWNERSHIP_LABEL, STOCK_TRANSFER_REASON_LABEL } from '@/types';

export const metadata: Metadata = { title: 'Machine economics' };

const kes = (value: number | null) => (value === null ? 'not recorded' : `KES ${Math.round(value).toLocaleString('en-KE')}`);
const pct = (value: number | null) => (value === null ? '—' : `${value.toFixed(1)}%`);
const dateTime = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const TERM_LABEL = {
  inventoryOwner: { snack_quest: 'Snack Quest', machine_owner: 'The owner' },
  ownerCostBasis: { landed_cost: 'Snack Quest’s cost', wholesale_price: 'Owner wholesale price' },
  settlementModel: { owner_keeps_margin: 'Owner keeps the margin', revenue_share: 'Revenue share' },
  maintenanceResponsibility: { snack_quest: 'Snack Quest', owner: 'The owner' },
} as const;

/**
 * One machine's economic profile and P&L (§ MACHINE ECONOMIC PROFILE,
 * § MACHINE-LEVEL P&L): who owns it and its stock, on what terms, and what
 * it earned in a period, from the financial engine. The P&L needs
 * `finance.machine_pnl.view`; the Snack Quest view of costs needs
 * `products.cost.view`.
 */
export default async function MachineEconomicsPage({ params, searchParams }: { params: Promise<{ machineId: string }>; searchParams: Promise<{ preset?: string; from?: string; to?: string }> }) {
  const session = await requireAdminPage('vending', 'owners.view');
  const { machineId } = await params;
  const machine = await machineService.findById(session.businessId, machineId);
  if (!machine) notFound();
  const search = await searchParams;
  const period = resolvePeriod({ preset: search.preset, from: search.from, to: search.to });
  const canSeePnl = hasPermission(session, 'finance.machine_pnl.view');
  const canSeeCosts = hasPermission(session, 'products.cost.view');
  const perspective = canSeeCosts ? 'snack_quest' : 'owner';

  const [profile, pnl, transfers] = await Promise.all([
    machineEconomicProfileService.resolve(session.businessId, machineId),
    canSeePnl ? machinePnlService.forMachine({ businessId: session.businessId, machineId, periodStart: period.start, periodEnd: period.end, perspective }) : Promise.resolve(null),
    stockTransferRepository.listByMachine(session.businessId, machineId, 30),
  ]);
  const owner = profile.partnerId ? await partnerRepository.findById(session.businessId, profile.partnerId) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/admin/vending/${machineId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {machine.machineCode}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Economics</h1>
        <p className="text-sm text-muted-foreground">Who owns this machine and its stock, on what terms, and what it earns.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ownership and terms</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Owned by</dt>
            <dd>
              {MACHINE_OWNERSHIP_LABEL[profile.ownershipType]}
              {owner ? (
                <>
                  {' · '}
                  <Link href={`/admin/vending/partners/${profile.partnerId}`} className="text-primary hover:underline">{owner.name}</Link>
                </>
              ) : null}
            </dd>
            <dt className="text-muted-foreground">Stock owned by</dt>
            <dd>{TERM_LABEL.inventoryOwner[profile.terms.inventoryOwner]}</dd>
            {profile.settlesWithOwner ? (
              <>
                <dt className="text-muted-foreground">Owner pays for stock at</dt>
                <dd>{TERM_LABEL.ownerCostBasis[profile.terms.ownerCostBasis]}</dd>
                <dt className="text-muted-foreground">Settlement</dt>
                <dd>{TERM_LABEL.settlementModel[profile.terms.settlementModel]}</dd>
                <dt className="text-muted-foreground">Owner’s advertising share</dt>
                <dd>{profile.terms.adRevenueSharePartnerPct}%</dd>
              </>
            ) : (
              <>
                <dt className="text-muted-foreground">Settlement</dt>
                <dd>None — Snack Quest keeps the takings</dd>
              </>
            )}
            <dt className="text-muted-foreground">Maintenance paid by</dt>
            <dd>{TERM_LABEL.maintenanceResponsibility[profile.terms.maintenanceResponsibility]}</dd>
            <dt className="text-muted-foreground">Location commission</dt>
            <dd>{profile.locationCommissionPct === null ? 'not recorded' : `${profile.locationCommissionPct}%`}</dd>
          </dl>
          {profile.settlesWithOwner && profile.termsAreDefault ? (
            <p className="text-sm text-warning">
              No terms have been set on this owner’s agreement, so it follows the original rule: the owner pays Snack Quest’s cost for what sells. Set the terms on the{' '}
              <Link href={`/admin/vending/partners/${profile.partnerId}`} className="underline">owner’s page</Link>.
            </p>
          ) : null}
          {hasPermission(session, 'machines.economics.manage') ? <OwnershipTypeControl machineId={machineId} current={profile.ownershipType} hasOwner={Boolean(machine.ownerPartnerId)} /> : null}
        </CardContent>
      </Card>

      {pnl ? (
        <Card>
          <CardHeader className="flex flex-col gap-3">
            <CardTitle className="text-base">Profit and loss {perspective === 'owner' ? '(as the owner sees it)' : ''}</CardTitle>
            <nav aria-label="Period" className="flex flex-wrap gap-1">
              {PERIOD_PRESETS.filter((preset) => preset !== 'custom').map((preset) => (
                <Button key={preset} asChild size="sm" variant={preset === period.preset ? 'primary' : 'ghost'}>
                  <Link href={`/admin/vending/${machineId}/economics?preset=${preset}`}>{PERIOD_PRESET_LABEL[preset]}</Link>
                </Button>
              ))}
            </nav>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm tabular-nums">
              <dt className="text-muted-foreground">Sales ({pnl.product.units} units)</dt>
              <dd className="text-right">{kes(pnl.product.grossRevenueKes)}</dd>
              <dt className="text-muted-foreground">Cost of goods sold</dt>
              <dd className="text-right">− {kes(pnl.product.cogsKes)}</dd>
              <dt className="font-medium">Gross profit</dt>
              <dd className="text-right font-medium">{kes(pnl.product.grossProfitKes)} · {pct(pnl.product.grossMarginPct)}</dd>
              {pnl.contribution.lines
                .filter((line) => line.amountKes !== 0)
                .map((line) => (
                  <div key={line.key} className="contents">
                    <dt className="text-muted-foreground">{line.label}</dt>
                    <dd className="text-right">{line.amountKes === null ? 'not recorded' : `${line.amountKes < 0 ? '− ' : '+ '}${kes(Math.abs(line.amountKes))}`}</dd>
                  </div>
                ))}
              <dt className="font-semibold">Contribution</dt>
              <dd className="text-right font-semibold">{kes(pnl.contribution.contributionProfitKes)} · {pct(pnl.contribution.contributionMarginPct)}</dd>
            </dl>
            {pnl.snackQuestIncome ? (
              <div className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">Snack Quest’s income from this owner’s machine</p>
                <p className="text-muted-foreground tabular-nums">
                  Wholesale margin {kes(pnl.snackQuestIncome.wholesaleMarginKes)} · subscription {kes(pnl.snackQuestIncome.subscriptionKes)} · advertising {kes(pnl.snackQuestIncome.adShareKes)} = {kes(pnl.snackQuestIncome.totalKes)}
                </p>
                {pnl.snackQuestIncome.maintenanceKes > 0 ? (
                  <p className="text-muted-foreground tabular-nums">
                    Less maintenance Snack Quest paid for {kes(pnl.snackQuestIncome.maintenanceKes)} = {kes(pnl.snackQuestIncome.afterMaintenanceKes)}
                  </p>
                ) : null}
              </div>
            ) : null}
            <ul className="text-caption text-muted-foreground">
              <li>Contribution is before costs the system doesn’t hold; it is not net profit.</li>
              {pnl.contribution.missing.length > 0 ? <li>Not recorded yet: {pnl.contribution.missing.map((key) => pnl.contribution.lines.find((line) => line.key === key)?.label.toLowerCase()).join(', ')}.</li> : null}
              {pnl.product.unpricedUnits > 0 ? <li>{pnl.product.unpricedUnits} unit(s) have no recorded cost and are left out of profit.</li> : null}
              {pnl.estimatedCostUnits > 0 ? <li>{pnl.estimatedCostUnits} older sale(s) are costed at today’s cost.</li> : null}
              {pnl.advertising.uncomputedMonths.length > 0 ? <li>Ads played here in {pnl.advertising.uncomputedMonths.join(', ')}, but that month’s advertising revenue hasn’t been worked out yet, so it isn’t included.</li> : null}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stock movements in and out</CardTitle>
          <p className="text-sm text-muted-foreground">From the transfer ledger: where stock came from and went, who owned it, and at what cost.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-caption uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">What</th>
                <th className="px-4 py-2 text-right">Units</th>
                <th className="px-4 py-2">Owned by</th>
                {canSeeCosts ? <th className="px-4 py-2 text-right">Unit cost</th> : null}
              </tr>
            </thead>
            <tbody>
              {transfers.map(({ id, data }) => (
                <tr key={id} className="border-b border-border last:border-0 tabular-nums">
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{data.createdAt ? dateTime.format(data.createdAt.toDate()) : '—'}</td>
                  <td className="px-4 py-2">{STOCK_TRANSFER_REASON_LABEL[data.reason]}{data.to.slotId ? ` · slot ${data.to.slotId}` : data.from.slotId ? ` · slot ${data.from.slotId}` : ''}</td>
                  <td className="px-4 py-2 text-right">{data.quantity}</td>
                  <td className="px-4 py-2">{data.ownership === 'machine_owner' ? 'Owner' : 'Snack Quest'}</td>
                  {canSeeCosts ? <td className="px-4 py-2 text-right">{kes(data.unitCostBasisKes)}</td> : null}
                </tr>
              ))}
              {transfers.length === 0 ? (
                <tr>
                  <td colSpan={canSeeCosts ? 5 : 4} className="px-4 py-6 text-center text-muted-foreground">No stock has moved through the ledger yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
