import type { Metadata } from 'next';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { saleTraceService, type SaleTrace, type SaleTraceQuery, type SaleVerdict } from '@/services/saleTraceService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = { title: 'Trace a Sale' };

const VERDICT_CLASS: Record<SaleVerdict, string> = {
  delivered: 'bg-success/10 text-success',
  refunded: 'bg-border/40 text-muted-foreground',
  refund_owed: 'bg-danger/10 text-danger',
  under_review: 'bg-warning/10 text-warning',
  in_progress: 'bg-primary/10 text-primary',
  payment_not_received: 'bg-border/40 text-muted-foreground',
  not_paid: 'bg-border/40 text-muted-foreground',
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toQuery(params: Record<string, string | string[] | undefined>): SaleTraceQuery | null {
  const value = (key: string) => (typeof params[key] === 'string' ? (params[key] as string).trim() : '');
  const reference = value('reference');
  if (reference) {
    // Receipts, refs and ids look different enough that support shouldn't have to say which one they have.
    if (/^TXN-/i.test(reference)) return { transactionRef: reference.toUpperCase() };
    if (/^DSP-/i.test(reference)) return { commandRef: reference.toUpperCase() };
    if (reference.startsWith('ws_CO_')) return { checkoutRequestId: reference };
    if (/^[A-Za-z0-9]{8,12}$/.test(reference) && /\d/.test(reference) && /[A-Za-z]/.test(reference)) return { paymentRef: reference.toUpperCase() };
    return { transactionId: reference };
  }
  const machineCode = value('machineCode');
  const at = new Date(value('at'));
  if (machineCode && !Number.isNaN(at.getTime())) {
    return { machineCode, at, windowMinutes: 15 };
  }
  return null;
}

/** Support's answer to "I paid and didn't get my snack": every ledger for the sale on one page. */
export default async function TraceSalePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaffSession();
  const params = await searchParams;
  const query = toQuery(params);
  let sales: SaleTrace[] = query ? await saleTraceService.trace(session.businessId, query) : [];
  // Firestore ids are also 8–20 mixed characters; a "receipt" that matched nothing may be one.
  if (query && 'paymentRef' in query && sales.length === 0 && typeof params.reference === 'string') {
    sales = await saleTraceService.trace(session.businessId, { transactionId: params.reference.trim() });
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Trace a sale</h1>
        <p className="text-sm text-muted-foreground">Search by M-Pesa receipt or sale reference — or by machine and roughly when the customer paid.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-end">
          <form className="flex flex-1 flex-col gap-2" method="get">
            <label htmlFor="reference" className="text-sm font-medium text-foreground">Receipt or reference</label>
            <div className="flex gap-2">
              <input id="reference" name="reference" defaultValue={typeof params.reference === 'string' ? params.reference : ''} placeholder="e.g. SJK4XY12AB" className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm" />
              <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
                <Search className="size-4" aria-hidden="true" />
                Trace
              </button>
            </div>
          </form>
          <form className="flex flex-1 flex-col gap-2" method="get">
            <span className="text-sm font-medium text-foreground">Machine and time</span>
            <div className="flex flex-wrap gap-2">
              <input aria-label="Machine code" name="machineCode" defaultValue={typeof params.machineCode === 'string' ? params.machineCode : ''} placeholder="Machine code" className="h-10 w-40 rounded-lg border border-border bg-background px-3 text-sm" />
              <input aria-label="When the customer paid" type="datetime-local" name="at" defaultValue={typeof params.at === 'string' ? params.at : ''} className="h-10 rounded-lg border border-border bg-background px-3 text-sm" />
              <button type="submit" className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground">Search ±15 min</button>
            </div>
          </form>
        </CardContent>
      </Card>

      {query && sales.length === 0 ? <EmptyState icon={Search} title="No sale found" description="Nothing matches. Check the receipt, or widen the search with the machine and time." /> : null}

      {sales.map((sale) => (
        <Card key={sale.transactionId}>
          <CardHeader className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="text-base">{sale.transactionRef}</CardTitle>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${VERDICT_CLASS[sale.verdict]}`}>{sale.verdict.replace(/_/g, ' ')}</span>
              <span className="text-sm text-muted-foreground">
                KES {sale.amountKes} ·{' '}
                <Link href={`/admin/vending/${sale.machineId}`} className="text-primary hover:underline">{sale.machineCode ?? sale.machineId}</Link>
                {sale.paymentRef ? ` · ${sale.paymentRef}` : ''}
              </span>
            </div>
            <p className="text-sm text-foreground">{sale.summary}</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {sale.timeline.map((step, index) => (
                    <tr key={`${step.at}-${index}`} className="border-t border-border align-top">
                      <td className="whitespace-nowrap px-6 py-2 tabular-nums text-muted-foreground">{new Date(step.at).toLocaleString('en-KE')}</td>
                      <td className="px-6 py-2 text-xs uppercase tracking-wide text-muted-foreground">{step.source}</td>
                      <td className="px-6 py-2 text-foreground">
                        {step.what}
                        {step.detail ? <span className="ml-2 text-xs text-muted-foreground">{Object.entries(step.detail).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
