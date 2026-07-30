import React from 'react';
import { Megaphone } from 'lucide-react';
import { StatusBadge } from '../../common/StatusBadge';
import { ErrorState } from '../../common/ErrorState';
import { EmptyState } from '../../common/EmptyState';
import { DataTable, Column } from '../../common/DataTable';
import { CreatorDashboardPayload, CampaignSubmission } from '../creatorApi';

interface CampaignsViewProps {
  payload: CreatorDashboardPayload | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const columns: Column<CampaignSubmission>[] = [
  { header: 'Submission ID', accessorKey: 'id' },
  { header: 'Status', accessorKey: 'status', cell: (row) => <StatusBadge status={row.status} size="sm" /> }
];

export const CampaignsView: React.FC<CampaignsViewProps> = ({ payload, loading, error, onRetry }) => {
  if (loading) {
    return <div className="h-64 bg-creator-surface border border-creator-border rounded-creator-card animate-pulse" aria-hidden="true" />;
  }
  if (error) return <ErrorState title="Couldn't load campaigns" message={error} onRetry={onRetry} />;
  if (!payload) return null;

  const { campaign_submissions } = payload;

  return (
    <div className="space-y-8">
      <h1 className="text-creator-section-title font-bold text-creator-ink">Campaigns</h1>

      {campaign_submissions.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaign submissions yet"
          description="Once you submit proof of a brand deliverable, it'll appear here with its review status."
        />
      ) : (
        <DataTable
          title="Your submissions"
          data={campaign_submissions}
          columns={columns}
          searchKey="id"
          exportFilename="creator_campaign_submissions"
        />
      )}

      <EmptyState
        icon={Megaphone}
        title="Campaign discovery is coming soon"
        description="Browsing and joining new brand campaigns directly from the portal is on the roadmap — for now, new opportunities are shared with you directly."
      />
    </div>
  );
};
