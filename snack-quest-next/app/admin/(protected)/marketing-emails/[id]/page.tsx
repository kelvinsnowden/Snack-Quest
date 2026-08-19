import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { marketingEmailService, MarketingEmailNotFoundError } from '@/services/marketingEmailService';
import { SEGMENT_LABEL } from '@/lib/marketingEmails/segmentLabels';
import { MarketingEmailForm } from '@/components/admin/MarketingEmailForm';
import { MarketingEmailPreview } from '@/components/admin/MarketingEmailPreview';
import { ResendFailedButton } from '@/components/admin/ResendFailedButton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Campaign' };

const STATUS_VARIANT = { draft: 'outline', sending: 'warning', sent: 'success', failed: 'danger' } as const;

export default async function MarketingEmailDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaffSession();
  const { id } = await params;

  if (!isSuperAdmin(session)) {
    return (
      <Card className="flex max-w-2xl flex-col items-center gap-3 p-10 text-center">
        <ShieldAlert className="size-8 text-warning" aria-hidden="true" />
        <p className="text-card-title font-semibold text-foreground">Super admin access required</p>
      </Card>
    );
  }

  let campaign;
  try {
    campaign = await marketingEmailService.getCampaign(session.businessId, id);
  } catch (error) {
    if (error instanceof MarketingEmailNotFoundError) {
      notFound();
    }
    throw error;
  }

  const availableTestimonials =
    campaign.status === 'draft' ? await marketingEmailService.fetchTestimonials(session.businessId) : [];
  const initialSpecificCreators =
    campaign.status === 'draft' && campaign.specificCreatorIds
      ? await marketingEmailService.getCreatorSummaries(session.businessId, campaign.specificCreatorIds)
      : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/marketing-emails"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Marketing Emails
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{campaign.subject}</h1>
          <Badge variant={STATUS_VARIANT[campaign.status]}>{campaign.status}</Badge>
        </div>
      </div>

      {campaign.status === 'draft' ? (
        <MarketingEmailForm
          mode="edit"
          campaignId={id}
          availableTestimonials={availableTestimonials}
          initialValues={{
            subject: campaign.subject,
            preheader: campaign.preheader ?? '',
            heading: campaign.heading,
            bodyText: campaign.bodyText,
            imageUrl: campaign.imageUrl,
            ctaLabel: campaign.ctaLabel ?? '',
            ctaUrl: campaign.ctaUrl ?? '',
            featurePillsText: campaign.featurePills.join('\n'),
            includeTestimonials: campaign.includeTestimonials,
            segment: campaign.segment,
            customRecipientsText: (campaign.customRecipients ?? []).join('\n'),
            specificCreators: initialSpecificCreators,
          }}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-card-title font-semibold text-foreground">{campaign.recipientCount}</p>
                  <p className="text-caption text-muted-foreground uppercase">Recipients</p>
                </div>
                <div>
                  <p className="text-card-title font-semibold text-success">{campaign.sentCount}</p>
                  <p className="text-caption text-muted-foreground uppercase">Sent</p>
                </div>
                <div>
                  <p className="text-card-title font-semibold text-danger">{campaign.failedCount}</p>
                  <p className="text-caption text-muted-foreground uppercase">Failed</p>
                </div>
              </div>
              <dl className="flex flex-col gap-2 border-t border-border pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Segment</dt>
                  <dd className="text-foreground">{SEGMENT_LABEL[campaign.segment]}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Sent at</dt>
                  <dd className="text-foreground">
                    {campaign.sentAt
                      ? new Date((campaign.sentAt as unknown as { toDate: () => Date }).toDate()).toLocaleString()
                      : '—'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">Preview</p>
            <MarketingEmailPreview
              heading={campaign.heading}
              bodyText={campaign.bodyText}
              imageUrl={campaign.imageUrl}
              ctaLabel={campaign.ctaLabel}
              ctaUrl={campaign.ctaUrl}
              featurePills={campaign.featurePills}
              testimonials={campaign.sentTestimonials ?? []}
            />
          </div>

          {campaign.failedRecipients && campaign.failedRecipients.length > 0 ? (
            <div className="lg:col-span-2">
              <ResendFailedButton campaignId={id} failedRecipients={campaign.failedRecipients} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
