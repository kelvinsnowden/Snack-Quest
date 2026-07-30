import React from 'react';
import { LogOut } from 'lucide-react';
import { StatusBadge } from '../../common/StatusBadge';
import { ErrorState } from '../../common/ErrorState';
import { CreatorDashboardPayload } from '../creatorApi';

interface ProfileViewProps {
  payload: CreatorDashboardPayload | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSignOut: () => void;
}

const FIELD_ROWS: { label: string; key: 'full_name' | 'referral_code' }[] = [
  { label: 'Full name', key: 'full_name' },
  { label: 'Referral code', key: 'referral_code' }
];

export const ProfileView: React.FC<ProfileViewProps> = ({ payload, loading, error, onRetry, onSignOut }) => {
  if (loading) {
    return <div className="h-64 bg-creator-surface border border-creator-border rounded-creator-card animate-pulse" aria-hidden="true" />;
  }
  if (error) return <ErrorState title="Couldn't load your profile" message={error} onRetry={onRetry} />;
  if (!payload) return null;

  const { creator } = payload;

  return (
    <div className="space-y-8 max-w-xl">
      <h1 className="text-creator-section-title font-bold text-creator-ink">Profile</h1>

      <section className="bg-creator-surface border border-creator-border rounded-creator-card-lg divide-y divide-creator-border">
        {FIELD_ROWS.map(({ label, key }) => (
          <div key={key} className="p-5 flex items-center justify-between gap-4">
            <span className="text-creator-caption text-creator-ink-faint">{label}</span>
            <span className="text-creator-body font-semibold text-creator-ink truncate">{String(creator[key] ?? '—')}</span>
          </div>
        ))}
        <div className="p-5 flex items-center justify-between gap-4">
          <span className="text-creator-caption text-creator-ink-faint">Status</span>
          <StatusBadge status={String(creator.status)} size="sm" />
        </div>
        <div className="p-5 flex items-center justify-between gap-4">
          <span className="text-creator-caption text-creator-ink-faint">Tier</span>
          <span className="text-creator-body font-semibold text-creator-ink">{creator.tier}</span>
        </div>
      </section>

      <p className="text-creator-caption text-creator-ink-faint">
        Profile editing isn't available yet — reach out via Support if any of this needs updating.
      </p>

      <button
        type="button"
        onClick={onSignOut}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-creator-control border border-creator-border text-creator-danger hover:bg-creator-danger/10 text-creator-caption font-semibold transition-colors"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
};
