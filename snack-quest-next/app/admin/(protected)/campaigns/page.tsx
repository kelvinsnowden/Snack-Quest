import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Flag, ImageOff, Plus } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { campaignService } from '@/services/campaignService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import type { CampaignStatus } from '@/types';

export const metadata: Metadata = { title: 'Campaigns' };

const STATUS_VARIANT: Record<CampaignStatus, 'outline' | 'success' | 'warning' | 'secondary'> = {
  draft: 'outline',
  active: 'success',
  paused: 'warning',
  ended: 'secondary',
};

export default async function AdminCampaignsPage() {
  const session = await requireStaffSession();
  const campaigns = await campaignService.listAllCampaigns(session.businessId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-page-title font-bold tracking-tight text-foreground">Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">Brand campaigns creators can join for extra commission.</p>
        </div>
        <Button asChild>
          <Link href="/admin/campaigns/new">
            <Plus aria-hidden="true" />
            New campaign
          </Link>
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="No campaigns yet"
          description="Launch a campaign to give creators a reason to post about a specific box or promotion."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map(({ id, data }) => (
            <Card key={id} className="flex flex-col overflow-hidden p-0">
              <div className="relative aspect-[4/3] w-full bg-border/20">
                {data.assetsUrl ? (
                  <Image src={data.assetsUrl} alt={data.title} fill sizes="(min-width: 1024px) 33vw, 50vw" className="object-cover" unoptimized />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <ImageOff className="size-8" aria-hidden="true" />
                  </div>
                )}
                <div className="absolute top-2 right-2">
                  <Badge variant={STATUS_VARIANT[data.status]}>
                    {data.status[0].toUpperCase() + data.status.slice(1)}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div>
                  <Link href={`/admin/campaigns/${id}`} className="font-semibold text-foreground hover:underline">
                    {data.title}
                  </Link>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{data.rules}</p>
                </div>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <div>
                    <p className="font-semibold tabular-nums text-foreground">KES {data.commissionRateKes.toLocaleString()}</p>
                    <p className="text-caption text-muted-foreground">{data.targetNiche}</p>
                  </div>
                  <p className="text-caption text-muted-foreground tabular-nums">
                    Ends {data.deadline.toDate().toLocaleDateString()}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
