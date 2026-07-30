import React from 'react';
import { Megaphone, Calendar, Percent } from 'lucide-react';
import { EmptyState } from '../../common/EmptyState';
import { ErrorState } from '../../common/ErrorState';
import { Campaign } from '../creatorApi';

interface CampaignsViewProps {
  campaigns: Campaign[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSubmitDeliverable: (campaign: Campaign) => void;
}

export const CampaignsView: React.FC<CampaignsViewProps> = ({ campaigns, loading, error, onRetry, onSubmitDeliverable }) => {
  if (loading) {
    return (
      <div className="grid sm:grid-cols-2 gap-4" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-40 bg-creator-surface border border-creator-border rounded-creator-card-lg animate-pulse" />
        ))}
      </div>
    );
  }
  if (error) return <ErrorState title="Couldn't load campaigns" message={error} onRetry={onRetry} />;

  const activeCampaigns = campaigns.filter((c) => c.status === 'active');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-creator-section-title font-bold text-creator-ink">Campaigns</h1>
        <p className="text-creator-caption text-creator-ink-muted mt-1">Brand campaigns you can join and submit deliverables for.</p>
      </div>

      {activeCampaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No active campaigns right now"
          description="New brand campaigns will show up here as soon as they're live."
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {activeCampaigns.map((campaign) => (
            <div key={campaign.id} className="bg-creator-surface border border-creator-border rounded-creator-card-lg p-6 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-creator-body font-bold text-creator-ink">{campaign.title}</h2>
                <span className="shrink-0 inline-flex items-center gap-1 text-creator-caption font-bold text-creator-success">
                  <Percent className="h-3.5 w-3.5" aria-hidden="true" />
                  {campaign.commission_rate_kes} KES
                </span>
              </div>
              <p className="text-creator-caption text-creator-ink-muted mt-2 flex-1">{campaign.rules}</p>
              <div className="flex items-center gap-1.5 text-creator-caption text-creator-ink-faint mt-4">
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                Ends {new Date(campaign.deadline).toLocaleDateString('en-KE', { dateStyle: 'medium' })}
              </div>
              <button
                type="button"
                onClick={() => onSubmitDeliverable(campaign)}
                className="mt-4 w-full py-2.5 rounded-creator-control bg-creator-brand hover:bg-creator-brand-strong text-creator-brand-ink font-bold text-creator-caption transition-colors"
              >
                Submit deliverable
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
