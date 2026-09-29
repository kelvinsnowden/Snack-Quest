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
import { partnerMachineAgreementRepository } from '@/repositories/partnerMachineAgreementRepository';
import { BUSINESS_TIME_ZONE } from '@/lib/vending/businessClock';
import {
  OwnerForm,
  OwnerStatusControl,
  PortalInvite,
  NewAgreementForm,
  AgreementActions,
} from '@/components/admin/vending/OwnerControls';

export const metadata: Metadata = { title: 'Machine owner detail' };

/**
 * One machine owner's own commercial picture (§ OWNER WALLET,
 * § SETTLEMENT, § OWNER WITHDRAWAL, docs/MACHINE_COMMERCE.md §6/§7):
 * the wallet balance and the append-only ledger it's derived from,
 * every subscription and settlement across their fleet, and their
 * withdrawal history — plus the one action that exists without a
 * partner login yet, requesting a withdrawal on their behalf.
 */
export default async function AdminVendingPartnerDetailPage({
  params,
}: {
  params: Promise<{ partnerId: string }>;
}) {
  const session = await requireStaffSession();
  const { partnerId } = await params;

  const partner = await partnerService.findById(session.businessId, partnerId);
  if (!partner) {
    notFound();
  }

  const canManage = hasPermission(session, 'owners.manage');
  const canSeeMoney = hasPermission(session, 'owner_finance.view');
  const [
    machines,
    agreements,
    ledger,
    subscriptions,
    settlements,
    withdrawalPage,
  ] = await Promise.all([
    partnerService.listMachines(session.businessId, partnerId),
    partnerService.listAgreements(session.businessId, partnerId),
    canSeeMoney ? listEarningsLedger(partnerId) : Promise.resolve([]),
    canSeeMoney
      ? machineSubscriptionService.listByPartner(session.businessId, partnerId)
      : Promise.resolve([]),
    canSeeMoney
      ? machineSettlementService.listByPartner(session.businessId, partnerId)
      : Promise.resolve([]),
    canSeeMoney
      ? withdrawalService.listWithdrawalsForOwner(session.businessId, partnerId)
      : Promise.resolve({
          withdrawals: [] as Awaited<
            ReturnType<typeof withdrawalService.listWithdrawalsForOwner>
          >['withdrawals'],
        }),
  ]);
  const machineCode = new Map(
    machines.map(({ id, data }) => [id, data.machineCode]),
  );
  // An agreement on a machine that has since changed hands is shown by id; it's only ever ended, never restarted.
  const activeByMachine = new Set(
    (
      await Promise.all(
        machines.map(({ id }) =>
          partnerMachineAgreementRepository.findActiveForMachine(
            session.businessId,
            id,
          ),
        ),
      )
    )
      .filter(Boolean)
      .map((row) => row!.data.machineId),
  );
  const sortedAgreements = [...agreements].sort(
    (a, b) =>
      ['active', 'draft', 'terminated'].indexOf(a.data.status) -
      ['active', 'draft', 'terminated'].indexOf(b.data.status),
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <Link
          href="/admin/vending/partners"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Machine Owners
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-foreground text-2xl font-semibold">
            {partner.name}
          </h1>
          <p className="text-muted-foreground text-sm">
            {partner.contactPhone ??
              partner.contactEmail ??
              'No contact recorded'}
          </p>
        </div>
        <Badge variant={partner.status === 'active' ? 'success' : 'outline'}>
          {partner.status === 'active' ? 'Active' : 'Suspended'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <OwnerForm
              partnerId={partnerId}
              initial={{
                name: partner.name,
                contactEmail: partner.contactEmail ?? '',
                contactPhone: partner.contactPhone ?? '',
                note: partner.note ?? '',
              }}
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
              <p className="text-foreground text-sm">
                Suspended — they can’t sign in.
              </p>
            ) : partner.authUid ? (
              <p className="text-foreground text-sm">
                Signed up. They see only their own machines.
              </p>
            ) : partner.contactEmail ? (
              <PortalInvite email={partner.contactEmail} />
            ) : (
              <p className="text-muted-foreground text-sm">
                Add their email to let them sign up.
              </p>
            )}
            {canManage ? (
              <OwnerStatusControl
                partnerId={partnerId}
                name={partner.name}
                status={partner.status}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Machines ({machines.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {machines.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              None yet. To give them a machine, open the machine’s setup page
              and change its owner.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {machines.map(({ id, data }) => (
                <li key={id}>
                  <Link
                    href={`/admin/vending/${id}/setup`}
                    className="border-border text-foreground hover:bg-border/30 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{data.machineCode}</span>
                    <span className="text-muted-foreground">
                      {data.venueName ?? data.status}
                    </span>
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
            <p className="text-muted-foreground text-sm">
              No agreements recorded. Without an active one, settlements show no
              revenue split.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-border text-muted-foreground border-b text-left">
                    <th className="py-2 pr-4 font-medium">Machine</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Owner’s share</th>
                    <th className="py-2 pr-4 font-medium">Dates</th>
                    <th className="py-2 pr-4 font-medium">Document</th>
                    {canManage ? (
                      <th className="py-2 font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {sortedAgreements.map(({ id, data }) => (
                    <tr
                      key={id}
                      className="border-border border-b align-top last:border-0"
                    >
                      <td className="text-foreground py-3 pr-4 font-medium">
                        {machineCode.get(data.machineId) ?? data.machineId}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          variant={
                            data.status === 'active' ? 'success' : 'outline'
                          }
                        >
                          {data.status === 'terminated'
                            ? 'Ended'
                            : data.status === 'active'
                              ? 'Active'
                              : 'Draft'}
                        </Badge>
                      </td>
                      <td className="text-foreground py-3 pr-4 tabular-nums">
                        {data.revenueSharePartnerPct === null ? (
                          <span className="text-muted-foreground">Not set</span>
                        ) : (
                          `${data.revenueSharePartnerPct}%`
                        )}
                      </td>
                      <td className="text-muted-foreground py-3 pr-4">
                        {data.effectiveFrom
                          ? agreementDay.format(data.effectiveFrom.toDate())
                          : '—'}{' '}
                        –{' '}
                        {data.effectiveTo
                          ? agreementDay.format(data.effectiveTo.toDate())
                          : data.status === 'active'
                            ? 'now'
                            : '—'}
                      </td>
                      <td className="text-muted-foreground max-w-48 py-3 pr-4 break-words">
                        {data.documentRef ?? '—'}
                      </td>
                      {canManage ? (
                        <td className="py-3">
                          <AgreementActions
                            partnerId={partnerId}
                            agreementId={id}
                            status={data.status}
                            canStart={
                              machineCode.has(data.machineId) &&
                              !activeByMachine.has(data.machineId)
                            }
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {canManage ? (
            <div className="border-border border-t pt-4">
              <p className="text-foreground mb-3 text-sm font-medium">
                Record an agreement
              </p>
              <NewAgreementForm
                partnerId={partnerId}
                machines={machines.map(({ id, data }) => ({
                  id,
                  code: data.machineCode,
                  hasActive: activeByMachine.has(id),
                }))}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canSeeMoney ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
            <DetailStat
              label="Available balance"
              value={`KES ${partner.availableCashKes.toLocaleString('en-KE')}`}
            />
            <DetailStat
              label="Lifetime earned"
              value={`KES ${partner.lifetimeEarnedKes.toLocaleString('en-KE')}`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Wallet ledger</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {hasPermission(session, 'owner_finance.payouts.request') ? (
                <RequestPartnerWithdrawalAction
                  partnerId={partnerId}
                  availableCashKes={partner.availableCashKes}
                />
              ) : null}

              {ledger.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No earnings credited yet.
                </p>
              ) : (
                <div className="border-border overflow-x-auto border-t pt-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-border text-muted-foreground border-b text-left">
                        <th className="px-6 py-3 font-medium">Settlement</th>
                        <th className="px-6 py-3 font-medium">Machine</th>
                        <th className="px-6 py-3 font-medium">Amount</th>
                        <th className="px-6 py-3 font-medium">Credited</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((entry, index) => (
                        <tr
                          key={`${entry.settlementId}-${index}`}
                          className="border-border border-b last:border-0"
                        >
                          <td className="text-foreground px-6 py-3 font-medium">
                            {entry.settlementId}
                          </td>
                          <td className="text-muted-foreground px-6 py-3">
                            {entry.machineId}
                          </td>
                          <td className="text-muted-foreground px-6 py-3">
                            KES {entry.amountKes.toLocaleString('en-KE')}
                          </td>
                          <td className="text-muted-foreground px-6 py-3">
                            {formatDateTime(entry.createdAt)}
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
              <CardTitle>Withdrawal history</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {withdrawalPage.withdrawals.length === 0 ? (
                <p className="text-muted-foreground p-6 text-sm">
                  No withdrawals requested yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-border text-muted-foreground border-b text-left">
                        <th className="px-6 py-3 font-medium">Amount</th>
                        <th className="px-6 py-3 font-medium">Status</th>
                        <th className="px-6 py-3 font-medium">Requested</th>
                        <th className="px-6 py-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {withdrawalPage.withdrawals.map(({ id, data }) => (
                        <tr
                          key={id}
                          className="border-border border-b last:border-0"
                        >
                          <td className="text-foreground px-6 py-3 font-medium">
                            KES {data.amountKes.toLocaleString('en-KE')}
                          </td>
                          <td className="px-6 py-3">
                            <WithdrawalStatusBadge status={data.status} />
                          </td>
                          <td className="text-muted-foreground px-6 py-3">
                            {formatDateTime(data.createdAt)}
                          </td>
                          <td className="px-6 py-3">
                            <Link
                              href={`/admin/withdrawals/${id}`}
                              className="text-primary text-sm hover:underline"
                            >
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
                <p className="text-muted-foreground p-6 text-sm">
                  No subscriptions across this owner&apos;s fleet yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-border text-muted-foreground border-b text-left">
                        <th className="px-6 py-3 font-medium">Machine</th>
                        <th className="px-6 py-3 font-medium">Plan</th>
                        <th className="px-6 py-3 font-medium">Amount</th>
                        <th className="px-6 py-3 font-medium">Status</th>
                        <th className="px-6 py-3 font-medium">Arrears</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subscriptions.map(({ id, data }) => (
                        <tr
                          key={id}
                          className="border-border border-b last:border-0"
                        >
                          <td className="text-foreground px-6 py-3 font-medium">
                            {data.machineId}
                          </td>
                          <td className="text-muted-foreground px-6 py-3">
                            {data.planName}
                          </td>
                          <td className="text-muted-foreground px-6 py-3">
                            KES {data.amountKes.toLocaleString('en-KE')} /{' '}
                            {data.frequency}
                          </td>
                          <td className="text-muted-foreground px-6 py-3">
                            {data.status.replace('_', ' ')}
                          </td>
                          <td className="text-muted-foreground px-6 py-3">
                            KES {data.arrearsKes.toLocaleString('en-KE')}
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
              <CardTitle>Settlements</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {settlements.length === 0 ? (
                <p className="text-muted-foreground p-6 text-sm">
                  No settlements across this owner&apos;s fleet yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-border text-muted-foreground border-b text-left">
                        <th className="px-6 py-3 font-medium">Machine</th>
                        <th className="px-6 py-3 font-medium">Period</th>
                        <th className="px-6 py-3 font-medium">Distributable</th>
                        <th className="px-6 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlements.map(({ id, data }) => (
                        <tr
                          key={id}
                          className="border-border border-b last:border-0"
                        >
                          <td className="text-foreground px-6 py-3 font-medium">
                            {data.machineId}
                          </td>
                          <td className="text-muted-foreground px-6 py-3">
                            {formatDateTime(data.periodStart)} –{' '}
                            {formatDateTime(data.periodEnd)}
                          </td>
                          <td className="text-muted-foreground px-6 py-3">
                            KES{' '}
                            {data.distributableOwnerKes.toLocaleString('en-KE')}
                          </td>
                          <td className="text-muted-foreground px-6 py-3">
                            {data.status}
                          </td>
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
    </div>
  );
}

const agreementDay = new Intl.DateTimeFormat('en-KE', {
  timeZone: BUSINESS_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-caption text-muted-foreground font-medium tracking-wide uppercase">
          {label}
        </p>
        <p className="text-foreground mt-1 text-sm font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
