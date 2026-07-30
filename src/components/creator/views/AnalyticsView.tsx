import React from 'react';
import { MousePointerClick, Target, Percent } from 'lucide-react';
import { StatCard } from '../../common/StatCard';
import { CreatorAccount } from '../creatorApi';
import { formatCompactNumber, conversionRate } from '../format';

interface AnalyticsViewProps {
  creator: CreatorAccount;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ creator }) => (
  <div className="space-y-8">
    <div>
      <h1 className="text-creator-section-title font-bold text-creator-ink">Analytics</h1>
      <p className="text-creator-caption text-creator-ink-muted mt-1">Performance of your referral link across all channels.</p>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard label="Total clicks" value={formatCompactNumber(creator.total_clicks)} icon={MousePointerClick} />
      <StatCard label="Conversions" value={creator.total_conversions} icon={Target} />
      <StatCard label="Conversion rate" value={`${conversionRate(creator.total_clicks, creator.total_conversions)}%`} icon={Percent} emphasis />
    </div>
  </div>
);
