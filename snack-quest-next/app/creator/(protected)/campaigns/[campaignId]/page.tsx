import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileText, Film, SquareArrowOutUpRight } from 'lucide-react';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { campaignRepository } from '@/repositories/campaignRepository';
import { campaignService } from '@/services/campaignService';
import { SubmitDeliverableDialog } from '@/components/creator/SubmitDeliverableDialog';
import { SubmissionStatusBadge } from '@/components/creator/SubmissionStatusBadge';
import { PortalPageHeader } from '@/components/creator/design/PortalPageHeader';
import { PortalCard } from '@/components/creator/design/PortalCard';
import { formatDate, formatKes } from '@/lib/orders/format';
import { isDeadlinePassed, isVideoAsset } from '@/lib/creator/campaignPresentation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}): Promise<Metadata> {
  const { campaignId } = await params;
  return { title: `Campaign · ${campaignId}` };
}

/**
 * A single campaign's full detail (§ campaign attachments) — the route
 * that didn't exist before: every campaign card and dashboard link
 * used to point back at the plain `/creator/campaigns` list because
 * there was nowhere deeper to send a click. Shows everything an admin
 * can now attach (cover, gallery images, document, reference link,
 * rules) plus the creator's own submission history for this campaign
 * specifically, not just their global history.
 */
export default async function CreatorCampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const session = await requireCreatorSession();
  const { campaignId } = await params;

  const campaign = await campaignRepository.findById(session.businessId, campaignId);
  if (!campaign) {
    notFound();
  }

  const allSubmissions = await campaignService.listSubmissionsForCreator(session.businessId, session.uid);
  const submissions = allSubmissions.filter((s) => s.data.campaignId === campaignId);

  const isVideo = campaign.assetsUrl ? isVideoAsset(campaign.assetsUrl) : false;
  const deadlinePassed = isDeadlinePassed(campaign.deadline);
  const isJoinable = campaign.status === 'active' && !deadlinePassed;
  const galleryImages = campaign.imageUrls ?? [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        href="/creator/campaigns"
        className="text-muted-foreground focus-visible:ring-primary focus-visible:ring-offset-background -my-3 inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium hover:text-foreground focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All campaigns
      </Link>

      {campaign.assetsUrl && !isVideo ? (
        <div className="bg-foreground/5 relative aspect-[16/9] w-full overflow-hidden rounded-lg">
          <Image src={campaign.assetsUrl} alt={campaign.title} fill sizes="768px" className="object-cover" />
        </div>
      ) : campaign.assetsUrl && isVideo ? (
        <a
          href={campaign.assetsUrl}
          target="_blank"
          rel="noreferrer"
          className="border-border bg-surface text-primary flex aspect-[16/9] w-full items-center justify-center gap-2 rounded-lg border text-sm font-medium hover:underline"
        >
          <Film className="size-5" aria-hidden="true" />
          View campaign video
        </a>
      ) : null}

      <PortalPageHeader
        variant="content"
        title={campaign.title}
        description={`${campaign.targetNiche} · Ends ${formatDate(campaign.deadline)}`}
        action={
          isJoinable ? (
            <SubmitDeliverableDialog campaignId={campaignId} campaignTitle={campaign.title} />
          ) : (
            <span className="text-muted-foreground text-sm">
              {deadlinePassed ? 'Deadline passed' : 'Not currently accepting submissions'}
            </span>
          )
        }
      />

      <PortalCard className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-caption text-muted-foreground font-medium tracking-wide uppercase">Commission</p>
            <p className="text-foreground mt-1 font-medium">{formatKes(campaign.commissionRateKes)}</p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground font-medium tracking-wide uppercase">Deadline</p>
            <p className="text-foreground mt-1 font-medium">{formatDate(campaign.deadline)}</p>
          </div>
        </div>

        <div>
          <p className="text-caption text-muted-foreground font-medium tracking-wide uppercase">What to post</p>
          <p className="text-foreground mt-1 text-sm whitespace-pre-line">{campaign.rules}</p>
        </div>

        {campaign.referenceLink ? (
          <a
            href={campaign.referenceLink}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex w-fit items-center gap-1.5 text-sm font-medium hover:underline"
          >
            <SquareArrowOutUpRight className="size-4" aria-hidden="true" />
            Reference link
          </a>
        ) : null}

        {campaign.documentUrl ? (
          <a
            href={campaign.documentUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex w-fit items-center gap-1.5 text-sm font-medium hover:underline"
          >
            <FileText className="size-4" aria-hidden="true" />
            Download campaign document
          </a>
        ) : null}

        {galleryImages.length > 0 ? (
          <div>
            <p className="text-caption text-muted-foreground mb-2 font-medium tracking-wide uppercase">
              Reference images
            </p>
            <div className="grid grid-cols-3 gap-2">
              {galleryImages.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-foreground/5 relative aspect-square overflow-hidden rounded-md"
                >
                  <Image src={url} alt="" fill sizes="120px" className="object-cover" unoptimized />
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </PortalCard>

      <div>
        <h2 className="text-lg text-foreground font-semibold">Your submissions for this campaign</h2>
        {submissions.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">You haven&apos;t submitted anything for this campaign yet.</p>
        ) : (
          <ul className="border-border divide-border bg-surface mt-4 divide-y overflow-hidden rounded-lg border">
            {submissions.map(({ id, data }) => (
              <li key={id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-foreground text-sm font-medium">
                    {data.submissionType} · {formatDate(data.createdAt)}
                  </p>
                  <SubmissionStatusBadge status={data.status} />
                </div>
                {data.imageUrls.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {data.imageUrls.map((url) => (
                      <div key={url} className="relative size-14 overflow-hidden rounded-md border border-border">
                        <Image src={url} alt="" fill sizes="56px" className="object-cover" unoptimized />
                      </div>
                    ))}
                  </div>
                ) : null}
                {data.documentUrl ? (
                  <a
                    href={data.documentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary inline-flex w-fit items-center gap-1.5 text-sm font-medium hover:underline"
                  >
                    <FileText className="size-3.5" aria-hidden="true" />
                    Document
                  </a>
                ) : null}
                {data.socialLink ? (
                  <a
                    href={data.socialLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary w-fit text-sm font-medium hover:underline"
                  >
                    {data.socialLink}
                  </a>
                ) : null}
                {data.notes ? <p className="text-muted-foreground text-sm">{data.notes}</p> : null}
                {data.adminFeedback ? (
                  <p className="text-muted-foreground border-border border-t pt-2 text-sm">{data.adminFeedback}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
