import type { Metadata } from 'next';
import { ReceiptText } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { referralService } from '@/services/referralService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Commissions' };

/**
 * The commission ledger (§ Finance workspace) — every commission a
 * creator has earned, real data from `referralService.listCommissions`
 * (§ Admin: Referrals). Commissions are credited automatically the
 * moment an order uses a valid code; this is a ledger to review against
 * withdrawal requests, not an approval queue — there is no real
 * approval gate to build here (see that Service's own doc comment).
 */
export default async function FinanceCommissionsPage() {
  const session = await requireStaffSession();
  const { commissions } = await referralService.listCommissions(session.businessId);

  const totalCommissionKes = commissions.reduce((sum, { data }) => sum + data.commissionKes, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Commissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every commission awarded to a creator, most recent first.</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Total commissions</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{formatKes(totalCommissionKes)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ledger</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {commissions.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={ReceiptText}
                title="No commissions yet"
                description="Awarded commissions appear here as soon as a customer completes an order with a referral code."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Creator</th>
                    <th className="px-4 py-3 font-medium">Commission</th>
                    <th className="px-4 py-3 font-medium">Discount given</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map(({ id, data, creator }) => (
                    <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                      <td className="px-4 py-3 text-foreground">{creator?.displayName ?? data.creatorId}</td>
                      <td className="px-4 py-3 font-medium tabular-nums text-foreground">{formatKes(data.commissionKes)}</td>
                      <td className="px-4 py-3 tabular-nums text-foreground">{formatKes(data.discountKes)}</td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDate(data.createdAt)}</td>
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
