import type { Metadata } from 'next';
import { Banknote, Clock, TrendingUp, Wallet } from 'lucide-react';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { partnerService } from '@/services/partnerService';
import { withdrawalService } from '@/services/withdrawalService';
import { listEarningsLedger } from '@/repositories/partnerRepository';
import { WithdrawalRequestForm } from '@/components/partner/WithdrawalRequestForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendStatCard } from '@/components/admin/TrendStatCard';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Payouts' };

const WITHDRAWAL_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  submitting: 'Processing',
  approved: 'Approved',
  rejected: 'Rejected',
  paid: 'Paid',
  failed: 'Failed',
};

const WITHDRAWAL_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  submitting: 'warning',
  approved: 'warning',
  rejected: 'danger',
  paid: 'success',
  failed: 'danger',
};

const PENDING_WITHDRAWAL_STATUSES = new Set(['pending', 'submitting', 'approved']);

/** § PAYOUTS (formerly Wallet) — earned/pending/available/withdrawn, the withdrawal request form + history, and the earnings ledger. Never presents gross central Snack Quest cash; every figure here is `Partner.availableCashKes`/`lifetimeEarnedKes` or derived from the partner's own ledger/withdrawal history. */
export default async function PartnerPayoutsPage() {
  const session = await requirePartnerSession();
  const partner = await partnerService.findById(session.businessId, session.partnerId);
  if (!partner) {
    return null;
  }
  const [ledger, { withdrawals }] = await Promise.all([
    listEarningsLedger(session.partnerId),
    withdrawalService.listWithdrawalsForOwner(session.businessId, session.partnerId),
  ]);

  let pendingKes = 0;
  let withdrawnKes = 0;
  for (const { data } of withdrawals) {
    if (data.status === 'paid') {
      withdrawnKes += data.amountKes;
    } else if (PENDING_WITHDRAWAL_STATUSES.has(data.status)) {
      pendingKes += data.amountKes;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">Payouts</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TrendStatCard label="Available" value={`KES ${partner.availableCashKes.toLocaleString('en-KE')}`} icon={<Wallet className="size-4" aria-hidden="true" />} tone="primary" />
        <TrendStatCard label="Pending" value={`KES ${pendingKes.toLocaleString('en-KE')}`} icon={<Clock className="size-4" aria-hidden="true" />} tone="warning" />
        <TrendStatCard label="Withdrawn" value={`KES ${withdrawnKes.toLocaleString('en-KE')}`} icon={<Banknote className="size-4" aria-hidden="true" />} tone="secondary" />
        <TrendStatCard label="Lifetime earned" value={`KES ${partner.lifetimeEarnedKes.toLocaleString('en-KE')}`} icon={<TrendingUp className="size-4" aria-hidden="true" />} tone="success" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Request a withdrawal</CardTitle>
        </CardHeader>
        <CardContent>
          <WithdrawalRequestForm availableKes={partner.availableCashKes} />
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Withdrawal history</h2>
        {withdrawals.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No withdrawals yet.</p>
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              {withdrawals.map(({ id, data }) => (
                <div key={id} className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="font-semibold text-foreground">KES {data.amountKes.toLocaleString('en-KE')}</p>
                    <p className="text-xs text-muted-foreground">{data.createdAt.toDate().toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <Badge variant={WITHDRAWAL_STATUS_VARIANT[data.status] ?? 'warning'}>{WITHDRAWAL_STATUS_LABEL[data.status] ?? data.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Earnings ledger</h2>
        {ledger.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No earnings recorded yet.</p>
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              {ledger.slice(0, 20).map((entry, index) => (
                <div key={`${entry.settlementId}-${index}`} className="flex items-center justify-between gap-3 border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                  <span className="text-foreground">Settlement credit</span>
                  <span className="font-semibold text-success">+KES {entry.amountKes.toLocaleString('en-KE')}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
