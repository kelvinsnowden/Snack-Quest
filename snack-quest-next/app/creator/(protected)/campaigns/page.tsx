import type { Metadata } from 'next';
import { Megaphone } from 'lucide-react';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { campaignService } from '@/services/campaignService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SubmitDeliverableDialog } from '@/components/creator/SubmitDeliverableDialog';
import { SubmissionStatusBadge } from '@/components/creator/SubmissionStatusBadge';
import { formatDate, formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Campaigns' };

export default async function CreatorCampaignsPage() {
  const session = await requireCreatorSession();
  const [campaigns, submissions] = await Promise.all([
    campaignService.listActiveCampaigns(session.businessId),
    campaignService.listSubmissionsForCreator(session.businessId, session.uid),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Campaigns</h1>
        <p className="mt-1 text-sm text-muted-foreground">Brand campaigns you can join and submit content for.</p>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No active campaigns right now"
          description="Check back soon — new brand campaigns will appear here as they open."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {campaigns.map(({ id, data }) => (
            <Card key={id}>
              <CardHeader>
                <CardTitle>{data.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 pt-0">
                <p className="text-sm text-muted-foreground">{data.rules}</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Commission</p>
                    <p className="mt-1 font-medium text-foreground">{formatKes(data.commissionRateKes)}</p>
                  </div>
                  <div>
                    <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Deadline</p>
                    <p className="mt-1 font-medium text-foreground">{formatDate(data.deadline)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  {data.assetsUrl ? (
                    <a
                      href={data.assetsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      View assets
                    </a>
                  ) : (
                    <span />
                  )}
                  <SubmitDeliverableDialog campaignId={id} campaignTitle={data.title} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div>
        <h2 className="text-card-title font-semibold text-foreground">Your submissions</h2>
        {submissions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">You haven&apos;t submitted anything yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-caption font-medium tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Feedback</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map(({ id, data }) => (
                  <tr key={id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-foreground">{data.campaignTitle}</td>
                    <td className="px-4 py-3 text-muted-foreground">{data.submissionType}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDate(data.createdAt)}</td>
                    <td className="px-4 py-3">
                      <SubmissionStatusBadge status={data.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{data.adminFeedback ?? '—'}</td>
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
