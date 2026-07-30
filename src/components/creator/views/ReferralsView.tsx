import React from 'react';
import { Copy, Share2, Users, MousePointerClick } from 'lucide-react';
import { StatCard } from '../../common/StatCard';
import { ErrorState } from '../../common/ErrorState';
import { useApp } from '../../../context/AppContext';
import { CreatorDashboardPayload } from '../creatorApi';
import { formatCompactNumber } from '../format';

interface ReferralsViewProps {
  payload: CreatorDashboardPayload | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export const ReferralsView: React.FC<ReferralsViewProps> = ({ payload, loading, error, onRetry }) => {
  const { addToast } = useApp();

  if (loading) {
    return <div className="h-64 bg-creator-surface border border-creator-border rounded-creator-card animate-pulse" aria-hidden="true" />;
  }
  if (error) return <ErrorState title="Couldn't load referrals" message={error} onRetry={onRetry} />;
  if (!payload) return null;

  const { referral_link, analytics, creator } = payload;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referral_link);
      addToast({ type: 'success', title: 'Link copied', message: 'Your referral link is on your clipboard.' });
    } catch {
      addToast({ type: 'error', title: 'Copy failed', message: 'Select and copy the link manually.' });
    }
  };

  const handleShare = () => {
    const text = encodeURIComponent(`Snack Quest is dropping seriously good mystery snack boxes — join with my link: ${referral_link}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-8">
      <h1 className="text-creator-section-title font-bold text-creator-ink">Referrals</h1>

      <section className="bg-creator-surface border border-creator-border rounded-creator-card-lg p-6 sm:p-8">
        <p className="text-creator-caption font-semibold uppercase tracking-wide text-creator-ink-faint">Your code</p>
        <p className="text-creator-page-title font-bold text-creator-ink mt-1 tracking-tight">{creator.referral_code}</p>
        <p className="text-creator-caption text-creator-ink-muted mt-3 truncate">{referral_link}</p>

        <div className="flex flex-wrap items-center gap-2.5 mt-6">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-creator-control border border-creator-border text-creator-ink hover:bg-creator-surface-hover text-creator-caption font-semibold transition-colors"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            Copy link
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-creator-control bg-creator-success/10 border border-creator-success/30 text-creator-success hover:bg-creator-success/20 text-creator-caption font-semibold transition-colors"
          >
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
            Share on WhatsApp
          </button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 max-w-md">
        <StatCard label="Link clicks" value={formatCompactNumber(analytics.total_clicks)} icon={MousePointerClick} />
        <StatCard label="Conversions" value={analytics.conversions} icon={Users} />
      </div>
    </div>
  );
};
