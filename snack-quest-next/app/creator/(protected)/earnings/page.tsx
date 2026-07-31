import type { Metadata } from 'next';
import { Clock, ShoppingBag, Wallet } from 'lucide-react';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { creatorDashboardService } from '@/services/creatorDashboardService';
import { referralService } from '@/services/referralService';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Earnings' };

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}

function StatCard({ label, value, icon: Icon }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-6">
        <div>
          <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * A creator's earnings statement (§ Creator Portal commission views).
 * There is no pending/approved/paid state *per commission* in this
 * architecture — `ReferralAttributionRepository`'s own doc comment
 * explains why: a commission is credited the instant a valid code is
 * used, with no approval gate. "Paid" only applies once a creator
 * withdraws from their available balance (§ Creator Portal
 * withdrawals, a separate build) — so this page shows the real
 * lifecycle that exists: a balance summary plus the commission
 * history behind it, not a fabricated status column.
 */
export default async function CreatorEarningsPage() {
  const session = await requireCreatorSession();
  const [{ profile }, { attributions }] = await Promise.all([
    creatorDashboardService.getDashboard(session.uid),
    referralService.listCommissionsForCreator(session.businessId, session.uid),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Earnings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your balance and every commission behind it.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Available" value={formatKes(profile.availableCashKes)} icon={Wallet} />
        <StatCard label="Pending" value={formatKes(profile.pendingEarningsKes)} icon={Clock} />
        <StatCard label="Lifetime earned" value={formatKes(profile.lifetimeEarningsKes)} icon={ShoppingBag} />
      </div>

      {attributions.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No commissions yet"
          description="Share your referral link — commissions land here the moment a customer orders with your code."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-caption font-medium tracking-wide text-muted-foreground uppercase">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer discount</th>
                <th className="px-4 py-3">Your commission</th>
              </tr>
            </thead>
            <tbody>
              {attributions.map(({ id, data }) => (
                <tr key={id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDate(data.createdAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{data.orderId}</td>
                  <td className="px-4 py-3 tabular-nums text-foreground">{formatKes(data.discountKes)}</td>
                  <td className="px-4 py-3 font-medium tabular-nums text-foreground">{formatKes(data.commissionKes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
