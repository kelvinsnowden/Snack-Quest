import React from 'react';
import { Wallet, TrendingUp, Clock, MousePointerClick, Copy, Share2, ArrowRight } from 'lucide-react';
import { StatCard } from '../../common/StatCard';
import { StatusBadge } from '../../common/StatusBadge';
import { EmptyState } from '../../common/EmptyState';
import { ErrorState } from '../../common/ErrorState';
import { useApp } from '../../../context/AppContext';
import { CreatorDashboardPayload } from '../creatorApi';
import { formatKes, formatCompactNumber } from '../format';
import type { CreatorSection } from '../nav';

interface DashboardViewProps {
  payload: CreatorDashboardPayload | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onNavigate: (section: CreatorSection) => void;
  onOpenWithdraw: () => void;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCard key={i} label="" value="" loading />
        ))}
      </div>
      <div className="h-40 bg-creator-surface border border-creator-border rounded-creator-card animate-pulse" />
    </div>
  );
}

export const DashboardView: React.FC<DashboardViewProps> = ({ payload, loading, error, onRetry, onNavigate, onOpenWithdraw }) => {
  const { addToast } = useApp();

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState title="Couldn't load your dashboard" message={error} onRetry={onRetry} />;
  if (!payload) return null;

  const { creator, wallet, analytics, campaign_submissions, withdrawal_history, referral_link } = payload;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(referral_link);
      addToast({ type: 'success', title: 'Link copied', message: 'Your referral link is on your clipboard.' });
    } catch {
      addToast({ type: 'error', title: 'Copy failed', message: 'Select and copy the link manually.' });
    }
  };

  const handleShareWhatsapp = () => {
    const text = encodeURIComponent(`Snack Quest is dropping seriously good mystery snack boxes — join with my link: ${referral_link}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const recentSubmissions = campaign_submissions.slice(0, 3);
  const recentWithdrawals = withdrawal_history.slice(0, 3);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-creator-section-title font-bold text-creator-ink">Welcome back, {creator.full_name.split(' ')[0]}</h1>
          <p className="text-creator-caption text-creator-ink-muted mt-1">Here's how your Snack Quest partnership is doing.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 self-start px-3 py-1.5 rounded-full bg-creator-brand/10 border border-creator-brand/30 text-creator-caption font-bold text-creator-brand">
          {creator.tier}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total earnings" value={formatKes(wallet.total_earnings_kes)} icon={TrendingUp} emphasis />
        <StatCard label="Available balance" value={formatKes(wallet.available_balance_kes)} icon={Wallet} />
        <StatCard label="Pending payouts" value={formatKes(wallet.pending_payouts_kes)} icon={Clock} />
        <StatCard
          label="Conversion rate"
          value={`${analytics.conversion_rate_pct}%`}
          icon={MousePointerClick}
          helpText={`${formatCompactNumber(analytics.total_clicks)} clicks · ${analytics.conversions} conversions`}
        />
      </div>

      <div className="bg-creator-surface border border-creator-border rounded-creator-card-lg p-6 flex flex-col sm:flex-row sm:items-center gap-5 justify-between">
        <div className="min-w-0">
          <p className="text-creator-caption font-semibold uppercase tracking-wide text-creator-ink-faint">Your referral link</p>
          <p className="text-creator-body font-semibold text-creator-ink truncate mt-1">{referral_link}</p>
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
            <h2 className="text-creator-body font-bold text-creator-ink">Recent campaign submissions</h2>
            <button
              type="button"
              onClick={() => onNavigate('campaigns')}
              className="inline-flex items-center gap-1 text-creator-caption font-semibold text-creator-brand hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
          {recentSubmissions.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No submissions yet"
                description="When you submit proof of a campaign deliverable, it'll show up here for review."
              />
            </div>
          ) : (
            <ul className="divide-y divide-creator-border">
              {recentSubmissions.map((submission) => (
                <li key={submission.id} className="p-5 flex items-center justify-between gap-3">
                  <span className="text-creator-caption text-creator-ink-muted truncate">{submission.id}</span>
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
          {recentWithdrawals.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Wallet}
                title="No payouts yet"
                description="Withdraw your available balance and it'll appear here."
                actionLabel={wallet.available_balance_kes > 0 ? 'Withdraw now' : undefined}
                onAction={wallet.available_balance_kes > 0 ? onOpenWithdraw : undefined}
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
