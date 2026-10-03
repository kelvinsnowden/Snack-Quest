import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { partnerService } from '@/services/partnerService';
import { listEarningsLedger } from '@/repositories/partnerRepository';
import { machineSubscriptionService } from '@/services/machineSubscriptionService';
import { machineSettlementService } from '@/services/machineSettlementService';
import { withdrawalService } from '@/services/withdrawalService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WithdrawalStatusBadge } from '@/components/admin/WithdrawalStatusBadge';
import { RequestPartnerWithdrawalAction } from '@/components/admin/RequestPartnerWithdrawalAction';
import { formatDateTime } from '@/lib/orders/format';
import { hasPermission } from '@/lib/auth/permissions';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { actorNamesFor } from '@/lib/audit/actorNames';
import { EntityHistory } from '@/components/admin/EntityHistory';
import { ownerIntelligenceService } from '@/services/ownerIntelligenceService';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { partnerMachineAgreementRepository } from '@/repositories/partnerMachineAgreementRepository';
import { BUSINESS_TIME_ZONE } from '@/lib/vending/businessClock';
import { OwnerForm, OwnerStatusControl, PortalInvite, NewAgreementForm, AgreementActions } from '@/components/admin/vending/OwnerControls';
import { AgreementTermsEditor } from '@/components/admin/vending/EconomicsControls';
import { resolveTerms } from '@/services/machineEconomicProfileService';

export const metadata: Metadata = { title: 'Machine owner detail' };

/**
 * One machine owner's own commercial picture (§ OWNER WALLET,
 * § SETTLEMENT, § OWNER WITHDRAWAL, docs/MACHINE_COMMERCE.md §6/§7):
 * the wallet balance and the append-only ledger it's derived from,
 * every subscription and settlement across their fleet, and their
 * withdrawal history — plus the one action that exists without a
 * partner login yet, requesting a withdrawal on their behalf.
 */
export default async function AdminVendingPartnerDetailPage({ params }: { params: Promise<{ partnerId: string }> }) {
  const session = await requireStaffSession();
  const { partnerId } = await params;

  const partner = await partnerService.findById(session.businessId, partnerId);
  if (!partner) {
    notFound();
  }

  const canManage = hasPermission(session, 'owners.manage');
  const canSetTerms = hasPermission(session, 'machines.economics.manage');
  const canSeeMoney = hasPermission(session, 'owner_finance.view');
  const [machines, agreements, ledger, subscriptions, settlements, withdrawalPage] = await Promise.all([
    partnerService.listMachines(session.businessId, partnerId),
    partnerService.listAgreements(session.businessId, partnerId),
    canSeeMoney ? listEarningsLedger(partnerId) : Promise.resolve([]),
    canSeeMoney ? machineSubscriptionService.listByPartner(session.businessId, partnerId) : Promise.resolve([]),
    canSeeMoney ? machineSettlementService.listByPartner(session.businessId, partnerId) : Promise.resolve([]),
    canSeeMoney ? withdrawalService.listWithdrawalsForOwner(session.businessId, partnerId) : Promise.resolve({ withdrawals: [] as Awaited<ReturnType<typeof withdrawalService.listWithdrawalsForOwner>>['withdrawals'] }),
  ]);
  const machineCode = new Map(machines.map(({ id, data }) => [id, data.machineCode]));
  // An agreement on a machine that has since changed hands is shown by id; it can only be ended, never restarted.
  const activeByMachine = new Set((await Promise.all(machines.map(({ id }) => partnerMachineAgreementRepository.findActiveForMachine(session.businessId, id)))).filter(Boolean).map((row) => row!.data.machineId));
  const sortedAgreements = [...agreements].sort((a, b) => ['active', 'draft', 'terminated'].indexOf(a.data.status) - ['active', 'draft', 'terminated'].indexOf(b.data.status));
  const history = hasPermission(session, 'audit.view') ? await auditLogRepository.listForEntities(session.businessId, [partnerId, ...agreements.map(({ id }) => id)], 15) : null;
  const historyNames = history ? await actorNamesFor(history) : new Map<string, string>();
  // The same per-machine summary the owner's portal is built from, so staff can see what the owner sees.
  const ownerView = hasPermission(session, 'analytics.vending.view')
    ? (await Promise.all(machines.slice(0, 12).map(({ id }) => ownerIntelligenceService.getMachineOwnerSummary(session.businessId, partnerId, id, 30).catch(() => null)))).filter((row) => row !== null)
    : null;
  const ownerViewProducts = ownerView ? await snackItemRepository.findManyById(ownerView.map((row) => row.topProductId).filter((id): id is string => Boolean(id))) : new Map();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <Link href="/admin/vending/partners" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Machine Owners
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{partner.name}</h1>
          <p className="text-sm text-muted-foreground">{partner.contactPhone ?? partner.contactEmail ?? 'No contact recorded'}</p>
        </div>
        <Badge variant={partner.status === 'active' ? 'success' : 'outline'}>{partner.status === 'active' ? 'Active' : 'Suspended'}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <OwnerForm
              partnerId={partnerId}
              initial={{ name: partner.name, contactEmail: partner.contactEmail ?? '', contactPhone: partner.contactPhone ?? '', note: partner.note ?? '' }}
              claimed={partner.authUid !== null}
              canEdit={canManage}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Owner portal</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {partner.status !== 'active' ? (
              <p className="text-sm text-foreground">Suspended — they can’t sign in.</p>
            ) : partner.authUid ? (
              <p className="text-sm text-foreground">Signed up. They see only their own machines.</p>
            ) : partner.contactEmail ? (
              <PortalInvite email={partner.contactEmail} />
            ) : (
              <p className="text-sm text-muted-foreground">Add their email to let them sign up.</p>
            )}
            {canManage ? <OwnerStatusControl partnerId={partnerId} name={partner.name} status={partner.status} /> : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Machines ({machines.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {machines.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet. To give them a machine, open the machine’s setup page and change its owner.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {machines.map(({ id, data }) => (
                <li key={id}>
                  <Link href={`/admin/vending/${id}/setup`} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-border/30">
                    <span className="font-medium">{data.machineCode}</span>
                    <span className="text-muted-foreground">{data.venueName ?? data.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agreements</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {sortedAgreements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agreements recorded. Without an active one, settlements show no revenue split.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Machine</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Owner’s share</th>
                    <th className="py-2 pr-4 font-medium">Dates</th>
                    <th className="py-2 pr-4 font-medium">Document</th>
                    <th className="py-2 pr-4 font-medium">Terms</th>
                    {canManage ? (
                      <th className="py-2 font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {sortedAgreements.map(({ id, data }) => (
                    <tr key={id} className="border-b border-border align-top last:border-0">
                      <td className="py-3 pr-4 font-medium text-foreground">{machineCode.get(data.machineId) ?? data.machineId}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={data.status === 'active' ? 'success' : 'outline'}>{data.status === 'terminated' ? 'Ended' : data.status === 'active' ? 'Active' : 'Draft'}</Badge>
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-foreground">{data.revenueSharePartnerPct === null ? <span className="text-muted-foreground">Not set</span> : `${data.revenueSharePartnerPct}%`}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {data.effectiveFrom ? agreementDay.format(data.effectiveFrom.toDate()) : '—'} – {data.effectiveTo ? agreementDay.format(data.effectiveTo.toDate()) : data.status === 'active' ? 'now' : '—'}
                      </td>
                      <td className="max-w-48 break-words py-3 pr-4 text-muted-foreground">{data.documentRef ?? '—'}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {(() => {
                          const terms = resolveTerms(data.terms);
                          return (
                            <div className="flex flex-col gap-2">
                              <span>
                                {terms.inventoryOwner === 'machine_owner' ? 'Owner buys stock' : 'Snack Quest stock'} · pays {terms.ownerCostBasis === 'wholesale_price' ? 'wholesale price' : 'Snack Quest’s cost'} · ads {terms.adRevenueSharePartnerPct}%
                                {!data.terms || Object.keys(data.terms).length === 0 ? ' (not set — original rule)' : ''}
                              </span>
                              {canSetTerms && data.status !== 'terminated' ? <AgreementTermsEditor partnerId={partnerId} agreementId={id} terms={terms} /> : null}
                            </div>
                          );
                        })()}
                      </td>
                      {canManage ? (
                        <td className="py-3">
                          <AgreementActions partnerId={partnerId} agreementId={id} status={data.status} canStart={machineCode.has(data.machineId) && !activeByMachine.has(data.machineId)} />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {canManage ? (
            <div className="border-t border-border pt-4">
              <p className="mb-3 text-sm font-medium text-foreground">Record an agreement</p>
              <NewAgreementForm partnerId={partnerId} machines={machines.map(({ id, data }) => ({ id, code: data.machineCode, hasActive: activeByMachine.has(id) }))} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canSeeMoney ? (
        <>
      <div>
        <Link href={`/admin/vending/partners/${partnerId}/settlements`} className="inline-flex rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-border/30">
          Settlements: prepare, check and finalize
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        <DetailStat label="Available balance" value={`KES ${partner.availableCashKes.toLocaleString('en-KE')}`} />
        <DetailStat label="Lifetime earned" value={`KES ${partner.lifetimeEarnedKes.toLocaleString('en-KE')}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Wallet ledger</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {hasPermission(session, 'owner_finance.payouts.request') ? <RequestPartnerWithdrawalAction partnerId={partnerId} availableCashKes={partner.availableCashKes} /> : null}

          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">No earnings credited yet.</p>
          ) : (
            <div className="overflow-x-auto border-t border-border pt-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Settlement</th>
                    <th className="px-6 py-3 font-medium">Machine</th>
                    <th className="px-6 py-3 font-medium">Amount</th>
                    <th className="px-6 py-3 font-medium">Credited</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((entry, index) => (
                    <tr key={`${entry.settlementId}-${index}`} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-medium text-foreground">{entry.settlementId}</td>
                      <td className="px-6 py-3 text-muted-foreground">{entry.machineId}</td>
                      <td className="px-6 py-3 text-muted-foreground">KES {entry.amountKes.toLocaleString('en-KE')}</td>
                      <td className="px-6 py-3 text-muted-foreground">{formatDateTime(entry.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Withdrawal history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {withdrawalPage.withdrawals.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No withdrawals requested yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Amount</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Requested</th>
                    <th className="px-6 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawalPage.withdrawals.map(({ id, data }) => (
                    <tr key={id} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-medium text-foreground">KES {data.amountKes.toLocaleString('en-KE')}</td>
                      <td className="px-6 py-3">
                        <WithdrawalStatusBadge status={data.status} />
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{formatDateTime(data.createdAt)}</td>
                      <td className="px-6 py-3">
                        <Link href={`/admin/withdrawals/${id}`} className="text-sm text-primary hover:underline">
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscriptions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {subscriptions.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No subscriptions across this owner&apos;s fleet yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Machine</th>
                    <th className="px-6 py-3 font-medium">Plan</th>
                    <th className="px-6 py-3 font-medium">Amount</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Arrears</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map(({ id, data }) => (
                    <tr key={id} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-medium text-foreground">{data.machineId}</td>
                      <td className="px-6 py-3 text-muted-foreground">{data.planName}</td>
                      <td className="px-6 py-3 text-muted-foreground">
                        KES {data.amountKes.toLocaleString('en-KE')} / {data.frequency}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{data.status.replace('_', ' ')}</td>
                      <td className="px-6 py-3 text-muted-foreground">KES {data.arrearsKes.toLocaleString('en-KE')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settlements</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {settlements.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No settlements across this owner&apos;s fleet yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Machine</th>
                    <th className="px-6 py-3 font-medium">Period</th>
                    <th className="px-6 py-3 font-medium">Distributable</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map(({ id, data }) => (
                    <tr key={id} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-medium text-foreground">{data.machineId}</td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {formatDateTime(data.periodStart)} – {formatDateTime(data.periodEnd)}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">KES {data.distributableOwnerKes.toLocaleString('en-KE')}</td>
                      <td className="px-6 py-3 text-muted-foreground">{data.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
        </>
      ) : null}

      {ownerView && ownerView.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What the owner sees (last 30 days)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Machine</th>
                    <th className="px-6 py-3 text-right font-medium">Sales</th>
                    <th className="px-6 py-3 text-right font-medium">Revenue</th>
                    <th className="px-6 py-3 font-medium">Best seller</th>
                    <th className="px-6 py-3 text-right font-medium">Selling / carried</th>
                    <th className="px-6 py-3 text-right font-medium">Faults</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {ownerView.map((row) => (
                    <tr key={row.machineId} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-medium text-foreground">{machineCode.get(row.machineId) ?? row.machineId}</td>
                      <td className="px-6 py-3 text-right text-muted-foreground">{row.transactionCount}</td>
                      <td className="px-6 py-3 text-right text-muted-foreground">KES {row.revenueKes.toLocaleString('en-KE')}</td>
                      <td className="px-6 py-3 text-muted-foreground">{row.topProductId ? (ownerViewProducts.get(row.topProductId)?.name ?? row.topProductId) : '—'}</td>
                      <td className="px-6 py-3 text-right text-muted-foreground">
                        {row.stockHealth.sellableCount} / {row.stockHealth.assortmentCount}
                      </td>
                      <td className="px-6 py-3 text-right text-muted-foreground">{row.faultCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {machines.length > 12 ? <p className="px-6 py-3 text-xs text-muted-foreground">Showing the first 12 of {machines.length} machines.</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {history ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
          </CardHeader>
          <CardContent>
            <EntityHistory logs={history} actorNames={historyNames} moreHref={undefined} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

const agreementDay = new Intl.DateTimeFormat('en-KE', { timeZone: BUSINESS_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' });

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-caption text-muted-foreground font-medium tracking-wide uppercase">{label}</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}
