import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { marketingSmsService, MarketingSmsNotFoundError } from '@/services/marketingSmsService';
import { serializeSmsCampaign } from '@/lib/marketingSms/serialize';
import { SMS_SEGMENT_LABEL } from '@/lib/marketingSms/segmentLabels';
import { MarketingSmsResult } from '@/components/admin/MarketingSmsResult';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'SMS campaign' };

export default async function MarketingSmsCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaffSession();

  if (!isSuperAdmin(session)) {
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <ShieldAlert className="size-8 text-warning" aria-hidden="true" />
          <p className="text-card-title font-semibold text-foreground">Super admin access required</p>
        </Card>
      </div>
    );
  }

  const { id } = await params;
  let campaign;
  try {
    campaign = await marketingSmsService.getCampaign(session.businessId, id);
  } catch (error) {
    if (error instanceof MarketingSmsNotFoundError) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/admin/marketing-sms"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Marketing SMS
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">{campaign.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {SMS_SEGMENT_LABEL[campaign.segment] ?? campaign.segment}
        </p>
      </div>

      <MarketingSmsResult campaign={serializeSmsCampaign(id, campaign)} />
    </div>
  );
}
