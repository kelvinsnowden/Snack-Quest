import React from 'react';
import { MousePointerClick, Target, Percent } from 'lucide-react';
import { StatCard } from '../../common/StatCard';
import { ErrorState } from '../../common/ErrorState';
import { CreatorDashboardPayload } from '../creatorApi';
import { formatCompactNumber } from '../format';

interface AnalyticsViewProps {
  payload: CreatorDashboardPayload | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ payload, loading, error, onRetry }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <StatCard key={i} label="" value="" loading />
        ))}
      </div>
    );
  }
  if (error) return <ErrorState title="Couldn't load analytics" message={error} onRetry={onRetry} />;
  if (!payload) return null;

  const { analytics } = payload;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-creator-section-title font-bold text-creator-ink">Analytics</h1>
        <p className="text-creator-caption text-creator-ink-muted mt-1">Performance of your referral link across all channels.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total clicks" value={formatCompactNumber(analytics.total_clicks)} icon={MousePointerClick} />
        <StatCard label="Conversions" value={analytics.conversions} icon={Target} />
        <StatCard label="Conversion rate" value={`${analytics.conversion_rate_pct}%`} icon={Percent} emphasis />
      </div>
    </div>
  );
};
