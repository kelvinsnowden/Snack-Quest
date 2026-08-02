import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Link2, MousePointerClick, ShoppingBag } from 'lucide-react';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { referralService } from '@/services/referralService';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { CreateReferralLinkDialog } from '@/components/creator/CreateReferralLinkDialog';
import { CreatorReferralLinkActiveToggle } from '@/components/creator/CreatorReferralLinkActiveToggle';
import { CopyLinkButton } from '@/components/creator/CopyLinkButton';

export const metadata: Metadata = { title: 'Referrals' };

async function getOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get('host') ?? 'localhost:3000';
  const protocol = headerList.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

export default async function CreatorReferralsPage() {
  const session = await requireCreatorSession();
  const [{ links }, origin] = await Promise.all([
    referralService.listLinksForCreator(session.businessId, session.uid),
    getOrigin(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title font-bold tracking-tight text-foreground">Referral links</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each link gives your followers a discount and credits you a commission on every order.
          </p>
        </div>
        <CreateReferralLinkDialog />
      </div>

      {links.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No referral links yet"
          description="Create your first link to start earning commission on orders you refer."
          action={<CreateReferralLinkDialog />}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {links.map(({ id, data }) => (
            <Card key={id}>
              <CardContent className="flex flex-col gap-4 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold tabular-nums text-foreground">{data.code}</span>
                    <Badge variant={data.isActive ? 'success' : 'outline'}>{data.isActive ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <CreatorReferralLinkActiveToggle linkId={id} isActive={data.isActive} />
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
                  <code className="flex-1 truncate text-sm text-muted-foreground">
                    {origin}/r/{data.code}
                  </code>
                  <CopyLinkButton url={`${origin}/r/${data.code}`} />
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Discount</p>
                    <p className="mt-1 text-sm font-medium text-foreground">KES {data.discountKes.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Commission</p>
                    <p className="mt-1 text-sm font-medium text-foreground">KES {data.commissionKes.toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MousePointerClick className="size-4 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Clicks</p>
                      <p className="text-sm font-medium tabular-nums text-foreground">{data.clickCount.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ShoppingBag className="size-4 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Conversions</p>
                      <p className="text-sm font-medium tabular-nums text-foreground">{data.conversionCount.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
