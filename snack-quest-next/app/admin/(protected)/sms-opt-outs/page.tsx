import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { smsOptOutRepository } from '@/repositories/smsOptOutRepository';
import { serializeSmsOptOut } from '@/lib/marketingSms/serialize';
import { SmsOptOutManager } from '@/components/admin/SmsOptOutManager';

export const metadata: Metadata = { title: 'SMS opt-outs' };

export default async function AdminSmsOptOutsPage() {
  const session = await requireStaffSession();
  const optOuts = await smsOptOutRepository.listByBusiness(session.businessId);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <Link
          href="/admin/marketing-sms"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Marketing SMS
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">SMS opt-outs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customers who have asked not to receive marketing texts. Every marketing campaign skips them automatically.
        </p>
      </div>

      <SmsOptOutManager optOuts={optOuts.map(serializeSmsOptOut)} canRemove={isSuperAdmin(session)} />
    </div>
  );
}
