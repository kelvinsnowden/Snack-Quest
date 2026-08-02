import type { Metadata } from 'next';
import { Megaphone } from 'lucide-react';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { campaignService } from '@/services/campaignService';
import { EmptyState } from '@/components/ui/empty-state';
import { SubmitDeliverableDialog } from '@/components/creator/SubmitDeliverableDialog';
import { SubmissionStatusBadge } from '@/components/creator/SubmissionStatusBadge';
import { formatDate, formatKes } from '@/lib/orders/format';
import { PortalPageHeader } from '@/components/creator/design/PortalPageHeader';
import { PortalCard } from '@/components/creator/design/PortalCard';

export const metadata: Metadata = { title: 'Campaigns' };

export default async function CreatorCampaignsPage() {
  const session = await requireCreatorSession();
  const [campaigns, submissions] = await Promise.all([
    campaignService.listActiveCampaigns(session.businessId),
    campaignService.listSubmissionsForCreator(session.businessId, session.uid),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <PortalPageHeader
        title="Campaigns"
        description="Brand campaigns you can join and submit content for."
      />

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No active campaigns right now"
          description="Check back soon — new brand campaigns will appear here as they open."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {campaigns.map(({ id, data }) => (
            <PortalCard as="li" key={id} className="flex flex-col gap-4">
              <h2 className="text-card-title text-foreground font-semibold">
                {data.title}
              </h2>
              <p className="text-muted-foreground text-sm">{data.rules}</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-caption text-muted-foreground font-medium tracking-wide uppercase">
                    Commission
                  </p>
                  <p className="text-foreground mt-1 font-medium">
                    {formatKes(data.commissionRateKes)}
                  </p>
                </div>
                <div>
                  <p className="text-caption text-muted-foreground font-medium tracking-wide uppercase">
                    Deadline
                  </p>
                  <p className="text-foreground mt-1 font-medium">
                    {formatDate(data.deadline)}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                {data.assetsUrl ? (
                  <a
                    href={data.assetsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary text-sm font-medium hover:underline"
                  >
                    View assets
                  </a>
                ) : (
                  <span />
                )}
                <SubmitDeliverableDialog
                  campaignId={id}
                  campaignTitle={data.title}
                />
              </div>
            </PortalCard>
          ))}
        </ul>
      )}

      <div>
        <h2 className="text-card-title text-foreground font-semibold">
          Your submissions
        </h2>
        {submissions.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">
            You haven&apos;t submitted anything yet.
          </p>
        ) : (
          <div className="border-border bg-surface mt-4 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border text-caption text-muted-foreground border-b text-left font-medium tracking-wide uppercase">
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Feedback</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map(({ id, data }) => (
                  <tr key={id} className="border-border border-b last:border-0">
                    <td className="text-foreground px-4 py-3">
                      {data.campaignTitle}
                    </td>
                    <td className="text-muted-foreground px-4 py-3">
                      {data.submissionType}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 tabular-nums">
                      {formatDate(data.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <SubmissionStatusBadge status={data.status} />
                    </td>
                    <td className="text-muted-foreground px-4 py-3">
                      {data.adminFeedback ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
