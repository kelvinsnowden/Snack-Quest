import type { Metadata } from 'next';
import Image from 'next/image';
import { Film, Megaphone } from 'lucide-react';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { campaignService } from '@/services/campaignService';
import { EmptyState } from '@/components/ui/empty-state';
import { SubmitDeliverableDialog } from '@/components/creator/SubmitDeliverableDialog';
import { SubmissionStatusBadge } from '@/components/creator/SubmissionStatusBadge';
import { formatDate, formatKes } from '@/lib/orders/format';
import { PortalPageHeader } from '@/components/creator/design/PortalPageHeader';

export const metadata: Metadata = { title: 'Campaigns' };

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm'];

function isVideoAsset(url: string): boolean {
  const path = url.split('?')[0].toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/** Days until a Firestore deadline Timestamp resolves, or `null` if unset. Only used to flag campaigns actually closing soon — a deadline months out isn't "urgent". */
function daysUntilDeadline(value: unknown): number | null {
  const timestamp = value as { toDate?: () => Date } | undefined;
  const date = timestamp?.toDate ? timestamp.toDate() : null;
  if (!date) return null;
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil((date.getTime() - Date.now()) / msPerDay);
}

function urgencyLabel(daysLeft: number): string {
  if (daysLeft <= 0) return 'Ends today';
  if (daysLeft === 1) return '1 day left';
  return `${daysLeft} days left`;
}

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
          {campaigns.map(({ id, data }) => {
            const isVideo = data.assetsUrl ? isVideoAsset(data.assetsUrl) : false;
            const daysLeft = daysUntilDeadline(data.deadline);
            const isClosingSoon = daysLeft !== null && daysLeft <= 7;
            return (
              <li
                key={id}
                className="border-border bg-surface flex flex-col overflow-hidden rounded-lg border"
              >
                {data.assetsUrl && !isVideo ? (
                  <div className="bg-muted relative aspect-[16/9] w-full">
                    <Image
                      src={data.assetsUrl}
                      alt={data.title}
                      fill
                      sizes="(min-width: 768px) 50vw, 100vw"
                      className="object-cover"
                    />
                    <span className="bg-primary text-primary-foreground absolute top-3 left-3 rounded-full px-3 py-1 text-xs font-semibold shadow-sm">
                      {formatKes(data.commissionRateKes)}
                    </span>
                    {isClosingSoon ? (
                      <span className="bg-warning text-warning-foreground absolute top-3 right-3 rounded-full px-3 py-1 text-xs font-semibold shadow-sm">
                        {urgencyLabel(daysLeft)}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
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
                  <div className="mt-auto flex items-center justify-between gap-3">
                    {data.assetsUrl && isVideo ? (
                      <a
                        href={data.assetsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
                      >
                        <Film className="size-4" aria-hidden="true" />
                        View video
                      </a>
                    ) : (
                      <span />
                    )}
                    <SubmitDeliverableDialog
                      campaignId={id}
                      campaignTitle={data.title}
                    />
                  </div>
                </div>
              </li>
            );
          })}
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
          <ul className="border-border divide-border bg-surface mt-4 divide-y overflow-hidden rounded-lg border">
            {submissions.map(({ id, data }) => (
              <li key={id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-foreground truncate font-medium">
                      {data.campaignTitle}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {data.submissionType} · {formatDate(data.createdAt)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <SubmissionStatusBadge status={data.status} />
                  </div>
                </div>
                {data.adminFeedback ? (
                  <p className="text-muted-foreground border-border border-t pt-2 text-sm">
                    {data.adminFeedback}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
