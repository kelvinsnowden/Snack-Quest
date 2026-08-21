import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, ShieldAlert, BellOff } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { marketingSmsService } from '@/services/marketingSmsService';
import { smsOptOutRepository } from '@/repositories/smsOptOutRepository';
import { serializeSmsCampaign } from '@/lib/marketingSms/serialize';
import { MarketingSmsTable } from '@/components/admin/MarketingSmsTable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Marketing SMS' };

export default async function AdminMarketingSmsPage() {
  const session = await requireStaffSession();

  if (!isSuperAdmin(session)) {
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Marketing SMS</h1>
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <ShieldAlert className="size-8 text-warning" aria-hidden="true" />
          <p className="text-card-title font-semibold text-foreground">Super admin access required</p>
          <p className="text-sm text-muted-foreground">
            A marketing text costs money for every customer it reaches and cannot be recalled once sent — only a
            super admin can send one.
          </p>
        </Card>
      </div>
    );
  }

  const [{ campaigns, nextCursor }, optOutCount] = await Promise.all([
    marketingSmsService.listCampaigns(session.businessId),
    smsOptOutRepository.countByBusiness(session.businessId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Marketing SMS</h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            Text a real customer segment. You&rsquo;ll see who it reaches and what it costs before anything sends.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/sms-opt-outs">
              <BellOff className="size-4" aria-hidden="true" />
              Opt-outs
              {optOutCount > 0 ? <span className="ml-1 tabular-nums">({optOutCount})</span> : null}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/admin/marketing-sms/new">
              <Plus className="size-4" aria-hidden="true" />
              New campaign
            </Link>
          </Button>
        </div>
      </div>

      <MarketingSmsTable
        campaigns={campaigns.map(({ id, data }) => serializeSmsCampaign(id, data))}
        initialNextCursor={nextCursor}
      />
    </div>
  );
}
