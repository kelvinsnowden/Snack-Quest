import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Link2 } from 'lucide-react';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { referralService } from '@/services/referralService';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { CopyLinkButton } from '@/components/creator/CopyLinkButton';
import { PortalCard } from '@/components/creator/design/PortalCard';
import { PortalPageHeader } from '@/components/creator/design/PortalPageHeader';

export const metadata: Metadata = { title: 'Referral link' };

async function getOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get('host') ?? 'localhost:3000';
  const protocol =
    headerList.get('x-forwarded-proto') ??
    (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

/**
 * Referral link (§ referral system overhaul) — a creator gets exactly
 * one, auto-generated the moment they register, with a fixed
 * discount and a commission locked in permanently by their real
 * registration order (`lib/creators/referralEconomics.ts`). There is
 * nothing left to create or configure here: this screen is copy the
 * link and watch the two numbers that matter, clicks and conversions.
 * A creator can no longer pause their own link either — that's an
 * admin-only lever now (`/admin/referrals`), so a suspected-fraud
 * pause can't just be un-paused by the person being investigated.
 */
export default async function CreatorReferralsPage() {
  const session = await requireCreatorSession();
  const [{ links }, origin] = await Promise.all([
    referralService.listLinksForCreator(session.businessId, session.uid, {
      limit: 1,
    }),
    getOrigin(),
  ]);
  const link = links[0];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <PortalPageHeader
        title="Your referral link"
        description="Share it — every order placed with it gives your follower a discount and credits you a commission."
      />

      {!link ? (
        <EmptyState
          icon={Link2}
          title="Your link isn't ready yet"
          description="This is provisioned automatically when your account is set up. If it's been a while, reach out to support."
        />
      ) : (
        <PortalCard className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-foreground text-lg font-semibold tracking-wider tabular-nums">
              {link.data.code}
            </h2>
            <Badge variant={link.data.isActive ? 'success' : 'outline'}>
              {link.data.isActive ? 'Active' : 'Paused by admin'}
            </Badge>
          </div>

          {/* The point of the screen: the thing you paste somewhere. */}
          <div className="border-border bg-background flex items-center gap-2 rounded-md border p-2 pl-3">
            <code className="text-foreground min-w-0 flex-1 truncate text-sm">
              {origin}/r/{link.data.code}
            </code>
            <CopyLinkButton url={`${origin}/r/${link.data.code}`} />
          </div>

          <dl className="border-border flex flex-wrap gap-x-8 gap-y-3 border-t pt-4">
            {[
              {
                label: 'Discount',
                value: `KES ${link.data.discountKes.toLocaleString()}`,
              },
              {
                label: 'Commission',
                value: `KES ${link.data.commissionKes.toLocaleString()}`,
              },
              { label: 'Clicks', value: link.data.clickCount.toLocaleString() },
              {
                label: 'Conversions',
                value: link.data.conversionCount.toLocaleString(),
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
      )}
    </div>
  );
}
