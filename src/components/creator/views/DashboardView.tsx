import React from 'react';
import { Wallet, TrendingUp, Clock, MousePointerClick, Copy, Share2, ArrowRight, Megaphone } from 'lucide-react';
import { StatCard } from '../../common/StatCard';
import { StatusBadge } from '../../common/StatusBadge';
import { EmptyState } from '../../common/EmptyState';
import { ErrorState } from '../../common/ErrorState';
import { useApp } from '../../../context/AppContext';
import { CreatorAccount, CampaignSubmission, WithdrawalRecord } from '../creatorApi';
import { formatKes, formatCompactNumber, conversionRate } from '../format';
import type { CreatorSection } from '../nav';

interface DashboardViewProps {
  creator: CreatorAccount;
  submissions: CampaignSubmission[];
  withdrawals: WithdrawalRecord[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onNavigate: (section: CreatorSection) => void;
  onOpenWithdraw: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  creator,
  submissions,
  withdrawals,
  loading,
  error,
  onRetry,
  onNavigate,
  onOpenWithdraw
}) => {
  const { addToast } = useApp();
  const referralLink = `https://snackquests.shop/?ref=${creator.referral_code}`;

  if (error) return <ErrorState title="Couldn't load your activity" message={error} onRetry={onRetry} />;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      addToast({ type: 'success', title: 'Link copied', message: 'Your referral link is on your clipboard.' });
    } catch {
      addToast({ type: 'error', title: 'Copy failed', message: 'Select and copy the link manually.' });
    }
  };

  const handleShareWhatsapp = () => {
    const text = encodeURIComponent(`Snack Quest is dropping seriously good mystery snack boxes — join with my link: ${referralLink}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const recentSubmissions = submissions.slice(0, 3);
  const recentWithdrawals = withdrawals.slice(0, 3);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-creator-section-title font-bold text-creator-ink">Welcome back, {creator.first_name}</h1>
          <p className="text-creator-caption text-creator-ink-muted mt-1">Here's how your Snack Quest partnership is doing.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 self-start px-3 py-1.5 rounded-full bg-creator-brand/10 border border-creator-brand/30 text-creator-caption font-bold text-creator-brand">
          {creator.tier}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Lifetime earnings" value={formatKes(creator.lifetime_earnings)} icon={TrendingUp} emphasis />
        <StatCard label="Available cash" value={formatKes(creator.available_cash)} icon={Wallet} />
        <StatCard label="Pending earnings" value={formatKes(creator.pending_earnings)} icon={Clock} />
        <StatCard
          label="Conversion rate"
          value={`${conversionRate(creator.total_clicks, creator.total_conversions)}%`}
          icon={MousePointerClick}
          helpText={`${formatCompactNumber(creator.total_clicks)} clicks · ${creator.total_conversions} conversions`}
        />
      </div>

      <div className="bg-creator-surface border border-creator-border rounded-creator-card-lg p-6 flex flex-col sm:flex-row sm:items-center gap-5 justify-between">
        <div className="min-w-0">
          <p className="text-creator-caption font-semibold uppercase tracking-wide text-creator-ink-faint">Your referral link</p>
          <p className="text-creator-body font-semibold text-creator-ink truncate mt-1">{referralLink}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-creator-control border border-creator-border text-creator-ink hover:bg-creator-surface-hover text-creator-caption font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-creator-brand/50"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            Copy
          </button>
          <button
            type="button"
            onClick={handleShareWhatsapp}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-creator-control bg-creator-success/10 border border-creator-success/30 text-creator-success hover:bg-creator-success/20 text-creator-caption font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-creator-success/50"
          >
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
            Share
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="bg-creator-surface border border-creator-border rounded-creator-card-lg overflow-hidden">
          <div className="p-5 border-b border-creator-border flex items-center justify-between">
            <h2 className="text-creator-body font-bold text-creator-ink">Recent submissions</h2>
            <button
              type="button"
              onClick={() => onNavigate('content')}
              className="inline-flex items-center gap-1 text-creator-caption font-semibold text-creator-brand hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
          {loading ? (
            <div className="p-5 space-y-3 animate-pulse" aria-hidden="true">
              <div className="h-4 bg-creator-surface-hover rounded" />
              <div className="h-4 bg-creator-surface-hover rounded w-2/3" />
            </div>
          ) : recentSubmissions.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Megaphone}
                title="No submissions yet"
                description="Submit proof of a campaign deliverable and it'll show up here for review."
                actionLabel="Browse campaigns"
                onAction={() => onNavigate('campaigns')}
              />
            </div>
          ) : (
            <ul className="divide-y divide-creator-border">
              {recentSubmissions.map((submission) => (
                <li key={submission.id} className="p-5 flex items-center justify-between gap-3">
                  <span className="text-creator-caption text-creator-ink-muted truncate">{submission.campaign_title}</span>
                  <StatusBadge status={submission.status} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-creator-surface border border-creator-border rounded-creator-card-lg overflow-hidden">
          <div className="p-5 border-b border-creator-border flex items-center justify-between">
            <h2 className="text-creator-body font-bold text-creator-ink">Recent payouts</h2>
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="inline-flex items-center gap-1 text-creator-caption font-semibold text-creator-brand hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
          {loading ? (
            <div className="p-5 space-y-3 animate-pulse" aria-hidden="true">
              <div className="h-4 bg-creator-surface-hover rounded" />
              <div className="h-4 bg-creator-surface-hover rounded w-2/3" />
            </div>
          ) : recentWithdrawals.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Wallet}
                title="No payouts yet"
                description="Withdraw your available cash and it'll appear here."
                actionLabel={creator.available_cash > 0 ? 'Withdraw now' : undefined}
                onAction={creator.available_cash > 0 ? onOpenWithdraw : undefined}
              />
            </div>
          ) : (
            <ul className="divide-y divide-creator-border">
              {recentWithdrawals.map((withdrawal) => (
                <li key={withdrawal.id} className="p-5 flex items-center justify-between gap-3">
                  <span className="text-creator-caption font-semibold text-creator-ink">{formatKes(withdrawal.amount_kes)}</span>
                  <StatusBadge status={withdrawal.status} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
