import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ChevronRight, Download, Receipt } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { vendingSalesService, SalesFilterError, type SalesFilter, type SalesPage } from '@/services/vendingSalesService';
import { vendingSaleReviewService, NEEDS_ATTENTION_STATUSES } from '@/services/vendingSaleReviewService';
import { SALE_STATUS_FILTERS, SALE_STATUS_LABEL } from '@/lib/vending/saleStatus';
import { BUSINESS_TIME_ZONE } from '@/lib/vending/businessClock';
import { formatKes } from '@/lib/orders/format';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { MachineTransactionStatusBadge } from '@/components/admin/MachineTransactionStatusBadge';
import type { MachineTransactionStatus } from '@/types';

export const metadata: Metadata = { title: 'Sales' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const dateTime = new Intl.DateTimeFormat('en-KE', { timeZone: BUSINESS_TIME_ZONE, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function readFilter(params: Record<string, string | string[] | undefined>): SalesFilter {
  const value = (key: string) => (typeof params[key] === 'string' ? (params[key] as string).trim() : '');
  const status = value('status');
  return {
    status: SALE_STATUS_FILTERS.includes(status as MachineTransactionStatus) ? (status as MachineTransactionStatus) : undefined,
    machineCode: value('machineCode') || undefined,
    from: value('from') || undefined,
    to: value('to') || undefined,
  };
}

function queryString(filter: SalesFilter, extra: Record<string, string> = {}): string {
  const entries = Object.entries({ ...filter, ...extra }).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '');
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
}

/**
 * Every vending sale across the fleet — what finance reconciles against
 * and what support searches when a customer calls. Filter by state,
 * machine and dates (Nairobi days), page through, or take the filtered
 * list away as a spreadsheet.
 */
export default async function VendingSalesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireStaffSession();
  const params = await searchParams;
  const filter = readFilter(params);
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined;

  let page: SalesPage = { rows: [], nextCursor: null, unknownMachineCode: null };
  let filterError: string | null = null;
  try {
    page = await vendingSalesService.list(session.businessId, filter, { limit: 50, cursor });
  } catch (error) {
    if (!(error instanceof SalesFilterError)) throw error;
    filterError = error.message;
  }
  const attention = await vendingSaleReviewService.listNeedingAttention(session.businessId, 100);
  const waiting = NEEDS_ATTENTION_STATUSES.reduce((sum, status) => sum + attention[status].length, 0);
  const filtered = Boolean(filter.status || filter.machineCode || filter.from || filter.to);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Sales</h1>
          <p className="text-sm text-muted-foreground">Every machine sale. Times are Nairobi time.</p>
        </div>
        <a
          href={`/api/vending/sales/export${queryString(filter)}`}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-border/30"
        >
          <Download className="size-4" aria-hidden="true" />
          Download CSV
        </a>
      </div>

      {waiting > 0 ? (
        <Link href="/admin/vending/sales/review" className="flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground hover:bg-warning/15">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>
              <strong className="font-semibold">{waiting} sale{waiting === 1 ? '' : 's'} need a decision</strong>
              {' — '}
              {NEEDS_ATTENTION_STATUSES.filter((status) => attention[status].length > 0)
                .map((status) => `${attention[status].length} ${SALE_STATUS_LABEL[status].toLowerCase()}`)
                .join(', ')}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
        </Link>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Status
              <select name="status" defaultValue={filter.status ?? ''} className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal">
                <option value="">All</option>
                {SALE_STATUS_FILTERS.map((status) => (
                  <option key={status} value={status}>{SALE_STATUS_LABEL[status]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Machine code
              <input name="machineCode" defaultValue={filter.machineCode ?? ''} placeholder="e.g. SQ-MCH-000012" className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              From
              <input type="date" name="from" defaultValue={filter.from ?? ''} className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              To
              <input type="date" name="to" defaultValue={filter.to ?? ''} className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal" />
            </label>
            <div className="flex gap-2">
              <button type="submit" className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Show sales</button>
              {filtered ? (
                <Link href="/admin/vending/sales" className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm text-foreground hover:bg-border/30">Clear</Link>
              ) : null}
            </div>
          </form>
          {filterError ? <p role="alert" className="mt-3 text-sm text-danger">{filterError}</p> : null}
          {page.unknownMachineCode ? <p role="alert" className="mt-3 text-sm text-danger">No machine has the code “{page.unknownMachineCode}”.</p> : null}
        </CardContent>
      </Card>

      {page.rows.length === 0 && !filterError && !page.unknownMachineCode ? (
        <EmptyState icon={Receipt} title={filtered ? 'No sales match' : 'No sales yet'} description={filtered ? 'Nothing matches these filters. Widen the dates or clear a filter.' : 'Sales appear here as soon as a customer starts paying at a machine.'} />
      ) : null}

      {page.rows.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-medium">When</th>
                    <th scope="col" className="px-4 py-3 font-medium">Sale</th>
                    <th scope="col" className="px-4 py-3 font-medium">Machine</th>
                    <th scope="col" className="px-4 py-3 font-medium">Product</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Amount</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    <th scope="col" className="px-4 py-3 font-medium">M-Pesa receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map(({ id, sale, machineCode, productName }) => (
                    <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">{dateTime.format(sale.createdAt.toDate())}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link href={`/admin/vending/sales/${id}`} className="font-medium text-primary hover:underline">{sale.transactionRef}</Link>
                        {sale.paymentMethod === 'diagnostic' ? <span className="ml-2 text-xs text-muted-foreground">test vend</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link href={`/admin/vending/${sale.machineId}`} className="text-foreground hover:underline">{machineCode ?? sale.machineId}</Link>
                        <span className="ml-1 text-xs text-muted-foreground">· {sale.slotId}</span>
                      </td>
                      <td className="px-4 py-3 text-foreground">{productName}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-foreground">{formatKes(sale.amountKes)}</td>
                      <td className="whitespace-nowrap px-4 py-3"><MachineTransactionStatusBadge status={sale.status} /></td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">{sale.paymentRef && !sale.paymentRef.startsWith('DIAGNOSTIC') ? sale.paymentRef : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex justify-end gap-2">
        {cursor ? (
          <Link href={`/admin/vending/sales${queryString(filter)}`} className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm text-foreground hover:bg-border/30">Back to newest</Link>
        ) : null}
        {page.nextCursor ? (
          <Link href={`/admin/vending/sales${queryString(filter, { cursor: page.nextCursor })}`} className="inline-flex h-10 items-center gap-1 rounded-lg border border-border px-4 text-sm text-foreground hover:bg-border/30">
            Older sales
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
