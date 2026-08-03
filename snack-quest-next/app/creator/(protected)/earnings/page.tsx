import type { Metadata } from 'next';
import { ShoppingBag } from 'lucide-react';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { creatorDashboardService } from '@/services/creatorDashboardService';
import { referralService } from '@/services/referralService';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatKes } from '@/lib/orders/format';
import { PortalPageHeader } from '@/components/creator/design/PortalPageHeader';
import { StatTile } from '@/components/creator/design/StatTile';

export const metadata: Metadata = { title: 'Earnings' };

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
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <PortalPageHeader
        title="Earnings"
        description="Your balance and every commission behind it."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
        <StatTile
          label="Available"
          value={formatKes(profile.availableCashKes)}
        />
        <StatTile
          label="Pending"
          value={formatKes(profile.pendingEarningsKes)}
        />
        <StatTile
          label="Lifetime earned"
          value={formatKes(profile.lifetimeEarningsKes)}
        />
      </div>

      {attributions.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No commissions yet"
          description="Share your referral link — commissions land here the moment a customer orders with your code."
        />
      ) : (
        <ul className="border-border divide-border bg-surface divide-y overflow-hidden rounded-lg border">
          {attributions.map(({ id, data }) => (
            <li key={id} className="flex items-center gap-3 p-4">
              <span
                aria-hidden="true"
                className="bg-success/10 text-success flex size-10 shrink-0 items-center justify-center rounded-full"
              >
                <ShoppingBag className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate font-medium">
                  Order {data.orderId}
                </p>
                <p className="text-muted-foreground text-sm tabular-nums">
                  {formatDate(data.createdAt)} · {formatKes(data.discountKes)}{' '}
                  discount given
                </p>
              </div>
              <p className="text-success shrink-0 font-semibold tabular-nums">
                +{formatKes(data.commissionKes)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
