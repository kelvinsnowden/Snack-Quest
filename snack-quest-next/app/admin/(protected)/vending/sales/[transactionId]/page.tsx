import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Camera, History, ReceiptText, ShoppingBasket } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_OR_FINANCE } from '@/lib/auth/requireStaffRole';
import { vendingSaleReviewService, SaleReviewError, type SaleReviewDetail } from '@/services/vendingSaleReviewService';
import { resolveVendingProductNames } from '@/lib/vending/productNames';
import { BUSINESS_TIME_ZONE } from '@/lib/vending/businessClock';
import { formatKes } from '@/lib/orders/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MachineTransactionStatusBadge } from '@/components/admin/MachineTransactionStatusBadge';
import { SaleReviewActions } from '@/components/admin/SaleReviewActions';
import type { VendingRefund } from '@/types';

export const metadata: Metadata = { title: 'Sale' };

const dateTime = new Intl.DateTimeFormat('en-KE', { timeZone: BUSINESS_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
const when = (value: { toDate(): Date } | null | undefined) => (value ? dateTime.format(value.toDate()) : '—');

const REFUND_STATUS: Record<VendingRefund['status'], { label: string; variant: 'success' | 'warning' | 'danger' | 'outline' }> = {
  pending: { label: 'Sent, no answer yet', variant: 'warning' },
  processing: { label: 'With Safaricom', variant: 'warning' },
  succeeded: { label: 'Money returned', variant: 'success' },
  failed: { label: 'Failed', variant: 'danger' },
};

const HISTORY_ACTION: Record<string, string> = {
  sale_review_confirm_delivered: 'Confirmed delivered',
  sale_review_start_refund: 'Marked refund owed',
  sale_review_reverse_payment: 'Sent M-Pesa reversal',
  sale_review_record_refund: 'Recorded refund',
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

/**
 * One sale, everything known about it, and — when it's waiting on a
 * person — the decision. Everyone with vending access can read it; only
 * admin and finance can decide what happens to the customer's money.
 */
export default async function SaleDetailPage({ params }: { params: Promise<{ transactionId: string }> }) {
  const session = await requireStaffSession();
  const { transactionId } = await params;

  let detail: SaleReviewDetail;
  try {
    detail = await vendingSaleReviewService.getSale(session.businessId, transactionId);
  } catch (error) {
    if (error instanceof SaleReviewError && error.code === 'not_found') notFound();
    throw error;
  }
  const { sale, trace, refunds, cartSiblings, snapshots, history, actions, machineCode } = detail;
  const names = await resolveVendingProductNames(session.businessId, [sale.productId, ...cartSiblings.map(({ sale: s }) => s.productId)]);
  const canDecide = hasStaffRole(session, ADMIN_OR_FINANCE);
  const anyAction = actions.some((entry) => entry.allowed);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link href="/admin/vending/sales/review" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Sales to review
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">{sale.transactionRef}</h1>
          <MachineTransactionStatusBadge status={sale.status} />
          {sale.paymentMethod === 'diagnostic' ? <Badge variant="outline">Staff test vend</Badge> : null}
        </div>
        {trace ? <p className="mt-2 max-w-3xl text-sm text-foreground">{trace.summary}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ReceiptText className="size-4 text-muted-foreground" aria-hidden="true" />
              The sale
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Fact label="Amount">{formatKes(sale.amountKes)}</Fact>
              <Fact label="Product">{names.get(sale.productId) ?? sale.productId}</Fact>
              <Fact label="Machine · slot">
                <Link href={`/admin/vending/${sale.machineId}`} className="text-primary hover:underline">{machineCode ?? sale.machineId}</Link> · {sale.slotId}
              </Fact>
              <Fact label="Started">{when(sale.createdAt)}</Fact>
              <Fact label="Paid">{when(sale.paidAt)}</Fact>
              <Fact label="Delivered">{when(sale.dispensedAt)}</Fact>
              <Fact label="Payment">{sale.paymentMethod === 'mpesa' ? 'M-Pesa' : sale.paymentMethod}</Fact>
              <Fact label="M-Pesa receipt"><span className="font-mono">{sale.paymentRef && !sale.paymentRef.startsWith('DIAGNOSTIC') ? sale.paymentRef : '—'}</span></Fact>
              <Fact label="Dispense">{trace?.commandRef ? `${trace.commandRef} (${trace.commandStatus})` : '—'}</Fact>
            </dl>
            {sale.failureReason ? (
              <p className="mt-4 rounded-lg bg-border/30 px-3 py-2 text-sm text-foreground">
                <span className="font-medium">What the system recorded: </span>
                {sale.failureReason}
              </p>
            ) : null}
            {sale.outcomeConflict ? (
              <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-sm text-foreground">
                The machine later reported “{sale.outcomeConflict.reportedStatus}” after this sale was “{sale.outcomeConflict.previousStatus}” ({when(sale.outcomeConflict.reportedAt)}).{' '}
                {sale.outcomeConflict.resolved ? 'A person has since decided this sale.' : 'Nobody has decided which is right yet.'}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Decision</CardTitle>
          </CardHeader>
          <CardContent>
            {canDecide ? (
              <SaleReviewActions transactionId={transactionId} amountLabel={formatKes(sale.amountKes)} actions={actions} />
            ) : (
              <p className="text-sm text-muted-foreground">{anyAction ? 'An admin or someone in finance decides what happens to this sale. Share this page with them.' : 'Nothing to decide on this sale right now.'}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {cartSiblings.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingBasket className="size-4 text-muted-foreground" aria-hidden="true" />
              Paid for in the same M-Pesa payment
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul>
              {cartSiblings.map(({ id, sale: sibling }) => (
                <li key={id} className="flex flex-wrap items-center gap-3 border-t border-border px-6 py-3 text-sm">
                  <Link href={`/admin/vending/sales/${id}`} className="font-medium text-primary hover:underline">{sibling.transactionRef}</Link>
                  <span className="text-muted-foreground">{names.get(sibling.productId) ?? sibling.productId} · slot {sibling.slotId} · {formatKes(sibling.amountKes)}</span>
                  <MachineTransactionStatusBadge status={sibling.status} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {refunds.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Refunds</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th scope="col" className="px-6 py-3 font-medium">Started</th>
                    <th scope="col" className="px-6 py-3 font-medium">How</th>
                    <th scope="col" className="px-6 py-3 font-medium">Amount</th>
                    <th scope="col" className="px-6 py-3 font-medium">Status</th>
                    <th scope="col" className="px-6 py-3 font-medium">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {refunds.map(({ id, data }) => (
                    <tr key={id} className="border-b border-border align-top last:border-0">
                      <td className="whitespace-nowrap px-6 py-3 tabular-nums text-muted-foreground">{when(data.createdAt)}</td>
                      <td className="px-6 py-3 text-foreground">
                        {data.method === 'mpesa_reversal' ? 'M-Pesa reversal' : 'Sent another way (recorded)'}
                        <p className="text-xs text-muted-foreground">{data.note}</p>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 tabular-nums text-foreground">{formatKes(data.amountKes)}</td>
                      <td className="px-6 py-3"><Badge variant={REFUND_STATUS[data.status].variant}>{REFUND_STATUS[data.status].label}</Badge></td>
                      <td className="px-6 py-3 font-mono text-xs text-muted-foreground">{data.externalReference ?? data.reversalTransactionId ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
          <p className="text-sm text-muted-foreground">Everything recorded about this sale, from payment to the machine’s reports.</p>
        </CardHeader>
        <CardContent className="p-0">
          {trace && trace.timeline.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {trace.timeline.map((step, index) => (
                    <tr key={`${step.at}-${index}`} className="border-t border-border align-top">
                      <td className="whitespace-nowrap px-6 py-2 tabular-nums text-muted-foreground">{dateTime.format(new Date(step.at))}</td>
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
          ) : (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Nothing recorded yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="size-4 text-muted-foreground" aria-hidden="true" />
              Camera snapshots
            </CardTitle>
          </CardHeader>
          <CardContent>
            {snapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No snapshot was taken for this sale.</p>
            ) : (
              <>
                <ul className="flex flex-col gap-2">
                  {snapshots.map(({ id, data }) => (
                    <li key={id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="tabular-nums text-muted-foreground">{when(data.capturedAt)}</span>
                      <Badge variant={data.success ? 'success' : 'danger'}>{data.success ? 'Captured' : `Failed${data.errorMessage ? `: ${data.errorMessage}` : ''}`}</Badge>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">Snapshot images can’t be viewed here yet: no image storage is connected for camera snapshots.</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4 text-muted-foreground" aria-hidden="true" />
              Decisions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one has made a decision on this sale.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {history.map(({ id, data }) => (
                  <li key={id} className="text-sm">
                    <p className="text-foreground">
                      <span className="font-medium">{HISTORY_ACTION[data.action] ?? data.action.replace(/_/g, ' ')}</span>
                      <span className="text-muted-foreground"> · {when(data.createdAt)} · {data.actorId}</span>
                    </p>
                    {typeof data.after?.note === 'string' ? <p className="text-muted-foreground">“{data.after.note}”</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
