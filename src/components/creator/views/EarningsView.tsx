import React from 'react';
import { TrendingUp, Wallet, Clock, Sparkles } from 'lucide-react';
import { StatCard } from '../../common/StatCard';
import { ErrorState } from '../../common/ErrorState';
import { CreatorDashboardPayload } from '../creatorApi';
import { formatKes } from '../format';
import { calculateCreatorTier } from '../../../services/affiliateService';

interface EarningsViewProps {
  payload: CreatorDashboardPayload | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenWithdraw: () => void;
}

function EarningsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <StatCard key={i} label="" value="" loading />
      ))}
    </div>
  );
}

export const EarningsView: React.FC<EarningsViewProps> = ({ payload, loading, error, onRetry, onOpenWithdraw }) => {
  if (loading) return <EarningsSkeleton />;
  if (error) return <ErrorState title="Couldn't load earnings" message={error} onRetry={onRetry} />;
  if (!payload) return null;

  const { wallet, analytics } = payload;
  const tierInfo = calculateCreatorTier(wallet.total_earnings_kes, analytics.conversions);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-creator-section-title font-bold text-creator-ink">Earnings</h1>
        <button
          type="button"
          onClick={onOpenWithdraw}
          disabled={wallet.available_balance_kes <= 0}
          className="px-4 py-2.5 rounded-creator-control bg-creator-brand hover:bg-creator-brand-strong text-creator-brand-ink font-bold text-creator-caption transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Withdraw
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Lifetime earnings" value={formatKes(wallet.total_earnings_kes)} icon={TrendingUp} emphasis />
        <StatCard label="Available balance" value={formatKes(wallet.available_balance_kes)} icon={Wallet} />
        <StatCard label="Pending payouts" value={formatKes(wallet.pending_payouts_kes)} icon={Clock} />
      </div>

      <section className="bg-creator-surface border border-creator-border rounded-creator-card-lg p-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">
            {tierInfo.badge}
          </span>
          <div>
            <h2 className="text-creator-body font-bold text-creator-ink">{tierInfo.tier} tier</h2>
            <p className="text-creator-caption text-creator-ink-muted">
              Reach {formatKes(tierInfo.nextThresholdKes)} lifetime earnings for the next tier.
            </p>
          </div>
        </div>
        <ul className="mt-5 grid sm:grid-cols-2 gap-2.5">
          {tierInfo.perks.map((perk) => (
            <li key={perk} className="flex items-center gap-2 text-creator-caption text-creator-ink-muted">
              <Sparkles className="h-3.5 w-3.5 text-creator-brand shrink-0" aria-hidden="true" />
              {perk}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};
