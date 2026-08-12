import type { Metadata } from 'next';
import { ShieldAlert } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { marketingEmailService } from '@/services/marketingEmailService';
import { MarketingEmailForm } from '@/components/admin/MarketingEmailForm';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'New campaign' };

export default async function NewMarketingEmailPage() {
  const session = await requireStaffSession();

  if (!isSuperAdmin(session)) {
    return (
      <Card className="flex max-w-2xl flex-col items-center gap-3 p-10 text-center">
        <ShieldAlert className="size-8 text-warning" aria-hidden="true" />
        <p className="text-card-title font-semibold text-foreground">Super admin access required</p>
      </Card>
    );
  }

  const availableTestimonials = await marketingEmailService.fetchTestimonials(session.businessId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">New campaign</h1>
        <p className="mt-1 text-sm text-muted-foreground">Saved as a draft first — nothing sends until you confirm.</p>
      </div>
      <MarketingEmailForm mode="create" availableTestimonials={availableTestimonials} />
    </div>
  );
}
