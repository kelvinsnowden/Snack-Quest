import React from 'react';
import { Sparkles } from 'lucide-react';
import { ErrorState } from '../../common/ErrorState';
import { CreatorDashboardPayload } from '../creatorApi';
import { formatKes } from '../format';
import { calculateCreatorTier } from '../../../services/affiliateService';

interface AchievementsViewProps {
  payload: CreatorDashboardPayload | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const TIER_ORDER = ['Explorer', 'Bronze', 'Silver', 'Gold', 'Diamond', 'Legend'] as const;

export const AchievementsView: React.FC<AchievementsViewProps> = ({ payload, loading, error, onRetry }) => {
  if (loading) {
    return <div className="h-64 bg-creator-surface border border-creator-border rounded-creator-card animate-pulse" aria-hidden="true" />;
  }
  if (error) return <ErrorState title="Couldn't load achievements" message={error} onRetry={onRetry} />;
  if (!payload) return null;

  const { wallet, analytics } = payload;
  const current = calculateCreatorTier(wallet.total_earnings_kes, analytics.conversions);
  const progressPct = Math.min(100, Math.round((wallet.total_earnings_kes / current.nextThresholdKes) * 100));

  return (
    <div className="space-y-8">
      <h1 className="text-creator-section-title font-bold text-creator-ink">Achievements</h1>

      <section className="bg-creator-surface border border-creator-border rounded-creator-card-lg p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden="true">
            {current.badge}
          </span>
          <div>
            <p className="text-creator-caption font-semibold uppercase tracking-wide text-creator-ink-faint">Current tier</p>
            <h2 className="text-creator-card-title font-bold text-creator-ink">{current.tier}</h2>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between text-creator-caption text-creator-ink-muted mb-2">
            <span>{formatKes(wallet.total_earnings_kes)} earned</span>
            <span>Next tier at {formatKes(current.nextThresholdKes)}</span>
          </div>
          <div className="h-2 rounded-full bg-creator-surface-hover overflow-hidden" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-creator-brand rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <ul className="mt-6 grid sm:grid-cols-2 gap-2.5">
          {current.perks.map((perk) => (
            <li key={perk} className="flex items-center gap-2 text-creator-caption text-creator-ink-muted">
              <Sparkles className="h-3.5 w-3.5 text-creator-brand shrink-0" aria-hidden="true" />
              {perk}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        {TIER_ORDER.map((tier) => (
          <span
            key={tier}
            className={`px-3 py-1.5 rounded-full text-creator-caption font-semibold border ${
              tier === current.tier
                ? 'bg-creator-brand/10 border-creator-brand/30 text-creator-brand'
                : 'border-creator-border text-creator-ink-faint'
            }`}
          >
            {tier}
          </span>
        ))}
      </div>
    </div>
  );
};
