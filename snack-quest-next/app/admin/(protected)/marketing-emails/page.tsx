import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { marketingEmailService } from '@/services/marketingEmailService';
import { serializeCampaign } from '@/lib/marketingEmails/serialize';
import { MarketingEmailTable } from '@/components/admin/MarketingEmailTable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus } from 'lucide-react';

export const metadata: Metadata = { title: 'Marketing Emails' };

export default async function AdminMarketingEmailsPage() {
  const session = await requireStaffSession();

  if (!isSuperAdmin(session)) {
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Marketing Emails</h1>
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <ShieldAlert className="size-8 text-warning" aria-hidden="true" />
          <p className="text-card-title font-semibold text-foreground">Super admin access required</p>
          <p className="text-sm text-muted-foreground">
            Sending a real email to every creator is one of the most sensitive actions in this platform — only a super admin can do it.
          </p>
        </Card>
      </div>
    );
  }

  const { campaigns, nextCursor } = await marketingEmailService.listCampaigns(session.businessId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Marketing Emails</h1>
          <p className="hidden sm:block mt-1 text-sm text-muted-foreground">
            Compose a branded email, preview exactly what it looks like, and send it to a real creator segment.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/admin/marketing-emails/new">
            <Plus className="size-4" aria-hidden="true" />
            New campaign
          </Link>
        </Button>
      </div>

      <MarketingEmailTable
        campaigns={campaigns.map(({ id, data }) => serializeCampaign(id, data))}
        initialNextCursor={nextCursor}
      />
    </div>
  );
}
