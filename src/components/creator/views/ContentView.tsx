import React from 'react';
import { FileVideo } from 'lucide-react';
import { StatusBadge } from '../../common/StatusBadge';
import { EmptyState } from '../../common/EmptyState';
import { ErrorState } from '../../common/ErrorState';
import { DataTable, Column } from '../../common/DataTable';
import { CampaignSubmission } from '../creatorApi';

interface ContentViewProps {
  submissions: CampaignSubmission[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const columns: Column<CampaignSubmission>[] = [
  { header: 'Campaign', accessorKey: 'campaign_title' },
  { header: 'Type', accessorKey: 'submission_type' },
  { header: 'Status', accessorKey: 'status', cell: (row) => <StatusBadge status={row.status} size="sm" /> },
  { header: 'Feedback', accessorKey: 'admin_feedback', cell: (row) => row.admin_feedback || '—' }
];

export const ContentView: React.FC<ContentViewProps> = ({ submissions, loading, error, onRetry }) => {
  if (loading) {
    return <div className="h-64 bg-creator-surface border border-creator-border rounded-creator-card animate-pulse" aria-hidden="true" />;
  }
  if (error) return <ErrorState title="Couldn't load your content" message={error} onRetry={onRetry} />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-creator-section-title font-bold text-creator-ink">Content</h1>
        <p className="text-creator-caption text-creator-ink-muted mt-1">Everything you've submitted for review.</p>
      </div>

      {submissions.length === 0 ? (
        <EmptyState
          icon={FileVideo}
          title="Nothing submitted yet"
          description="Deliverables you submit from the Campaigns tab will show up here with their review status."
        />
      ) : (
        <DataTable title="Your submissions" data={submissions} columns={columns} searchKey="campaign_title" exportFilename="creator_content" />
      )}
    </div>
  );
};
