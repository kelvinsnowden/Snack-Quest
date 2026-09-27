import type { Metadata } from 'next';
import { FileText } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = { title: 'Reports' };

/**
 * § REPORTS placeholder. No reporting/export aggregation exists yet —
 * Sales, Products and Payouts already cover the underlying figures;
 * this is a reachable nav destination rather than a dead link until a
 * real exportable-report feature is built.
 */
export default function PartnerReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground">Exportable reports for your fleet.</p>
      </div>
      <EmptyState
        icon={FileText}
        title="Reports are coming soon"
        description="In the meantime, Sales, Products and Payouts already cover your revenue, top sellers and earnings."
      />
    </div>
  );
}
