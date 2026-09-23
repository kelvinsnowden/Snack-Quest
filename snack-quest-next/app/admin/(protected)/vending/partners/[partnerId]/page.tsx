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

  const [ledger, subscriptions, settlements, withdrawalPage] = await Promise.all([
    listEarningsLedger(partnerId),
    machineSubscriptionService.listByPartner(session.businessId, partnerId),
    machineSettlementService.listByPartner(session.businessId, partnerId),
    withdrawalService.listWithdrawalsForOwner(session.businessId, partnerId),
  ]);

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
        <Badge variant={partner.status === 'active' ? 'success' : 'outline'}>{partner.status}</Badge>
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
          <RequestPartnerWithdrawalAction partnerId={partnerId} availableCashKes={partner.availableCashKes} />

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
    </div>
  );
}

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
