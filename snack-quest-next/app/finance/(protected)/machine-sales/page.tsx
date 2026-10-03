import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Download } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { SaleReviewQueue } from '@/components/vending/SaleReviewQueue';

export const metadata: Metadata = { title: 'Machine sales' };

/** Finance's view of machine sales: everything waiting on a decision or a refund, and the full list to take away. */
export default async function FinanceMachineSalesPage() {
  const session = await requireStaffSession();
  if (!hasPermission(session, 'sales.view')) redirect('/finance');
  return (
    <div className="flex flex-col gap-4">
      {hasPermission(session, 'sales.export') ? (
        <div className="flex justify-end">
          <a href="/api/vending/sales/export" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-border/30">
            <Download className="size-4" aria-hidden="true" />
            Download all machine sales (CSV)
          </a>
        </div>
      ) : null}
      <SaleReviewQueue businessId={session.businessId} basePath="/finance/machine-sales" />
    </div>
  );
}
