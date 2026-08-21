import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { MarketingSmsComposer } from '@/components/admin/MarketingSmsComposer';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'New SMS campaign' };

export default async function NewMarketingSmsPage() {
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
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">New SMS campaign</h1>
      </div>

      <MarketingSmsComposer />
    </div>
  );
}
