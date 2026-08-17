import type { Metadata } from 'next';
import { ShoppingBag } from 'lucide-react';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { creatorDashboardService } from '@/services/creatorDashboardService';
import { referralService } from '@/services/referralService';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatKes, toIsoString } from '@/lib/orders/format';
import { PortalPageHeader } from '@/components/creator/design/PortalPageHeader';
import { StatTile } from '@/components/creator/design/StatTile';
import { EarningsHistoryList } from '@/components/creator/EarningsHistoryList';

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
    creatorDashboardService.getDashboard(session.businessId, session.uid),
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
        <EarningsHistoryList
          rows={attributions.map(({ id, data }) => ({
            id,
            orderId: data.orderId,
            createdAtIso: toIsoString(data.createdAt),
            createdAtDisplay: formatDate(data.createdAt),
            discountKes: data.discountKes,
            commissionKes: data.commissionKes,
          }))}
        />
      )}
    </div>
  );
}
