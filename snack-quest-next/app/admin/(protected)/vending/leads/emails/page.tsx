import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { leadNurtureService } from '@/services/leadNurtureService';
import { NurtureSequenceEditor } from '@/components/admin/vending/NurtureSequenceEditor';

export const metadata: Metadata = { title: 'Lead emails' };

/** Admin → Vending → Leads → Emails: the automatic emails new leads receive (§ lead nurture). */
export default async function LeadEmailsPage() {
  const session = await requireStaffSession();
  const canManage = hasPermission(session, 'owners.manage');
  const sequence = await leadNurtureService.getSequence();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/vending/leads"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Leads
        </Link>
        <h1 className="text-foreground text-2xl font-bold tracking-tight md:text-3xl">Lead emails</h1>
        {!leadNurtureService.isEnabled() ? (
          <p className="text-muted-foreground text-sm">
            Sending is off until <code className="text-foreground">LEAD_NURTURE_ENABLED</code> is{' '}
            <code className="text-foreground">true</code> in Vercel.
          </p>
        ) : null}
      </div>
      <NurtureSequenceEditor initialEmails={sequence} canManage={canManage} />
    </div>
  );
}
