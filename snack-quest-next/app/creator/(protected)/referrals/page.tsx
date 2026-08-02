import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Link2 } from 'lucide-react';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { referralService } from '@/services/referralService';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { CreateReferralLinkDialog } from '@/components/creator/CreateReferralLinkDialog';
import { CreatorReferralLinkActiveToggle } from '@/components/creator/CreatorReferralLinkActiveToggle';
import { CopyLinkButton } from '@/components/creator/CopyLinkButton';
import { PortalCard } from '@/components/creator/design/PortalCard';
import { PortalPageHeader } from '@/components/creator/design/PortalPageHeader';

export const metadata: Metadata = { title: 'Referrals' };

async function getOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get('host') ?? 'localhost:3000';
  const protocol =
    headerList.get('x-forwarded-proto') ??
    (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

/**
 * Referral links (§ Creator Portal premium rebuild).
 *
 * The screen creators live in, so it is organised around the one thing
 * they came to do — get a link they can paste somewhere. The shareable
 * URL and its copy button are therefore the widest, highest-contrast
 * element in each card, not a footnote under the metrics.
 *
 * The per-link figures were a four-column grid that became two cramped
 * columns on a phone, two of them carrying an icon that only repeated
 * the label beside it. They are now a single wrapped row of
 * label-over-value pairs: the same four facts, readable at 360px,
 * without the icons.
 */
export default async function CreatorReferralsPage() {
  const session = await requireCreatorSession();
  const [{ links }, origin] = await Promise.all([
    referralService.listLinksForCreator(session.businessId, session.uid),
    getOrigin(),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <PortalPageHeader
        title="Referral links"
        description="Each link gives your followers a discount and credits you a commission on every order."
        action={links.length > 0 ? <CreateReferralLinkDialog /> : undefined}
      />

      {links.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No referral links yet"
          description="Create your first link to start earning commission on orders you refer. You can make as many as you like — one per platform is a good start."
          action={<CreateReferralLinkDialog />}
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {links.map(({ id, data }) => (
            <PortalCard as="li" key={id} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-foreground text-lg font-semibold tracking-wider tabular-nums">
                    {data.code}
                  </h2>
                  <Badge variant={data.isActive ? 'success' : 'outline'}>
                    {data.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <CreatorReferralLinkActiveToggle
                  linkId={id}
                  isActive={data.isActive}
                />
              </div>

              {/* The point of the screen: the thing you paste somewhere. */}
              <div className="border-border bg-background flex items-center gap-2 rounded-md border p-2 pl-3">
                <code className="text-foreground min-w-0 flex-1 truncate text-sm">
                  {origin}/r/{data.code}
                </code>
                <CopyLinkButton url={`${origin}/r/${data.code}`} />
              </div>

              <dl className="border-border flex flex-wrap gap-x-8 gap-y-3 border-t pt-4">
                {[
                  {
                    label: 'Discount',
                    value: `KES ${data.discountKes.toLocaleString()}`,
                  },
                  {
                    label: 'Commission',
                    value: `KES ${data.commissionKes.toLocaleString()}`,
                  },
                  {
                    label: 'Clicks',
                    value: data.clickCount.toLocaleString(),
                  },
                  {
                    label: 'Conversions',
                    value: data.conversionCount.toLocaleString(),
                  },
                ].map((stat) => (
                  <div key={stat.label}>
                    <dt className="text-caption text-muted-foreground font-medium tracking-wide uppercase">
                      {stat.label}
                    </dt>
                    <dd className="text-foreground mt-1 font-medium tabular-nums">
                      {stat.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </PortalCard>
          ))}
        </ul>
      )}
    </div>
  );
}
