import type { Metadata } from 'next';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { partnerService } from '@/services/partnerService';
import { withdrawalService } from '@/services/withdrawalService';
import { listEarningsLedger } from '@/repositories/partnerRepository';
import { WithdrawalRequestForm } from '@/components/partner/WithdrawalRequestForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Wallet' };

const WITHDRAWAL_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  submitting: 'Processing',
  approved: 'Approved',
  rejected: 'Rejected',
  paid: 'Paid',
  failed: 'Failed',
};

/** § OWNER WALLET — earned/pending/available/withdrawn, the earnings ledger, and the withdrawal request form + history. Never presents gross central Snack Quest cash; every figure here is `Partner.availableCashKes`/`lifetimeEarnedKes` or derived from the partner's own ledger/withdrawal history. */
export default async function PartnerWalletPage() {
  const session = await requirePartnerSession();
  const partner = await partnerService.findById(session.businessId, session.partnerId);
  if (!partner) {
    return null;
  }
  const [ledger, { withdrawals }] = await Promise.all([
    listEarningsLedger(session.partnerId),
    withdrawalService.listWithdrawalsForOwner(session.businessId, session.partnerId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">Wallet</h1>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Available</p>
            <p className="mt-1 text-xl font-bold text-foreground">KES {partner.availableCashKes.toLocaleString('en-KE')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Lifetime earned</p>
            <p className="mt-1 text-xl font-bold text-foreground">KES {partner.lifetimeEarnedKes.toLocaleString('en-KE')}</p>
          </CardContent>
        </Card>
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
          <div className="flex flex-col gap-2">
            {withdrawals.map(({ id, data }) => (
              <Card key={id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-semibold text-foreground">KES {data.amountKes.toLocaleString('en-KE')}</p>
                    <p className="text-xs text-muted-foreground">{data.createdAt.toDate().toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${data.status === 'paid' ? 'bg-success/10 text-success' : data.status === 'rejected' || data.status === 'failed' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>
                    {WITHDRAWAL_STATUS_LABEL[data.status] ?? data.status}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Earnings ledger</h2>
        {ledger.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No earnings recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {ledger.slice(0, 20).map((entry, index) => (
              <Card key={`${entry.settlementId}-${index}`}>
                <CardContent className="flex items-center justify-between p-4 text-sm">
                  <span className="text-foreground">Settlement credit</span>
                  <span className="font-semibold text-success">+KES {entry.amountKes.toLocaleString('en-KE')}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
