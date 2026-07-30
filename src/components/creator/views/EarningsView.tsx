import React from 'react';
import { TrendingUp, Wallet, Clock, Sparkles } from 'lucide-react';
import { StatCard } from '../../common/StatCard';
import { CreatorAccount } from '../creatorApi';
import { formatKes } from '../format';
import { calculateCreatorTier } from '../../../services/affiliateService';

interface EarningsViewProps {
  creator: CreatorAccount;
  onOpenWithdraw: () => void;
}

export const EarningsView: React.FC<EarningsViewProps> = ({ creator, onOpenWithdraw }) => {
  const tierInfo = calculateCreatorTier(creator.lifetime_earnings, creator.total_conversions);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-creator-section-title font-bold text-creator-ink">Earnings</h1>
        <button
          type="button"
          onClick={onOpenWithdraw}
          disabled={creator.available_cash <= 0}
          className="px-4 py-2.5 rounded-creator-control bg-creator-brand hover:bg-creator-brand-strong text-creator-brand-ink font-bold text-creator-caption transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Withdraw
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Lifetime earnings" value={formatKes(creator.lifetime_earnings)} icon={TrendingUp} emphasis />
        <StatCard label="Available cash" value={formatKes(creator.available_cash)} icon={Wallet} />
        <StatCard label="Pending earnings" value={formatKes(creator.pending_earnings)} icon={Clock} />
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
