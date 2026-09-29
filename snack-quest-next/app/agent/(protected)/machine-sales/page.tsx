import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Search } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { saleTraceService } from '@/services/saleTraceService';
import { saleQueryFromReference } from '@/lib/vending/saleSearch';
import { formatKes } from '@/lib/orders/format';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { MachineTransactionStatusBadge } from '@/components/admin/MachineTransactionStatusBadge';
import { SaleReviewQueue } from '@/components/vending/SaleReviewQueue';

export const metadata: Metadata = { title: 'Machine sales' };

/**
 * Support's answer to "I paid at the machine and nothing came out":
 * find the sale by the customer's M-Pesa receipt or sale reference, read
 * the plain-language verdict, and see the sales already waiting on
 * finance. Support reads; finance and admins decide.
 */
export default async function AgentMachineSalesPage({ searchParams }: { searchParams: Promise<{ reference?: string }> }) {
  const session = await requireStaffSession();
  if (!hasPermission(session, 'sales.view')) redirect('/agent');
  const { reference = '' } = await searchParams;
  const query = saleQueryFromReference(reference);
  let found = query ? await saleTraceService.trace(session.businessId, query) : [];
  if (query && 'paymentRef' in query && found.length === 0) {
    found = await saleTraceService.trace(session.businessId, { transactionId: reference.trim() });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Machine sales</h1>
        <p className="text-sm text-muted-foreground">Look a sale up by the customer’s M-Pesa receipt or the sale reference on their screen.</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form method="get" className="flex gap-2">
            <label htmlFor="reference" className="sr-only">Receipt or reference</label>
            <input id="reference" name="reference" defaultValue={reference} placeholder="e.g. SJK4XY12AB or TXN-…" className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm" />
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Search className="size-4" aria-hidden="true" />
              Find
            </button>
          </form>
        </CardContent>
      </Card>

      {query && found.length === 0 ? <EmptyState icon={Search} title="No sale found" description="Check the receipt with the customer. If they paid by M-Pesa, the receipt is the 10-character code in their confirmation message." /> : null}
      {found.map((sale) => (
        <Card key={sale.transactionId}>
          <CardContent className="flex flex-col gap-2 pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/agent/machine-sales/${sale.transactionId}`} className="font-semibold text-primary hover:underline">{sale.transactionRef}</Link>
              <MachineTransactionStatusBadge status={sale.status} />
              <span className="text-sm text-muted-foreground">{formatKes(sale.amountKes)} · {sale.machineCode ?? sale.machineId}</span>
            </div>
            <p className="text-sm text-foreground">{sale.summary}</p>
          </CardContent>
        </Card>
      ))}

      <SaleReviewQueue businessId={session.businessId} basePath="/agent/machine-sales" />
    </div>
  );
}
