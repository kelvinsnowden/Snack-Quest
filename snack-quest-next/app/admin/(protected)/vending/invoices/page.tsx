import type { Metadata } from 'next';
import { after } from 'next/server';
import Link from 'next/link';
import { AlertTriangle, ReceiptText } from 'lucide-react';
import { requireAdminPage } from '@/lib/auth/requireAdminSection';
import { hasPermission } from '@/lib/auth/permissions';
import { ownerInvoiceService } from '@/services/ownerInvoiceService';
import { partnerService } from '@/services/partnerService';
import { machineRepository } from '@/repositories/machineRepository';
import { OwnerInvoiceActions } from '@/components/admin/vending/OwnerInvoiceActions';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { OWNER_INVOICE_KIND_LABEL } from '@/types';

export const metadata: Metadata = { title: 'Owner invoices' };

const day = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric' });
const kes = (amount: number) => `KES ${amount.toLocaleString('en-KE')}`;
const SETTLED_DAYS = 60;

/**
 * § OWNER BILLING — who owes what. Every unpaid invoice across owners on
 * invoice billing (snacks delivered, management fees), oldest due first,
 * with recording a payment made another way and cancelling a charge; then
 * what was paid or cancelled lately. Owners pay from their own portal.
 */
export default async function OwnerInvoicesPage() {
  const session = await requireAdminPage('vending', 'owner_finance.view');
  const canManage = hasPermission(session, 'owner_finance.invoices.manage');
  const [{ open, settled, needsStaff }, owners, machines] = await Promise.all([
    ownerInvoiceService.listForStaff(session.businessId, SETTLED_DAYS),
    partnerService.listByBusiness(session.businessId),
    machineRepository.listAllForBusiness(session.businessId),
  ]);
  // Fee periods that started since the last daily run get their invoice now, for the next look.
  after(() => ownerInvoiceService.issueDue(session.businessId).catch((error) => console.error('[owner invoices] issue failed', error)));

  const names = new Map(owners.map(({ id, data }) => [id, data.name]));
  const codes = new Map(machines.map(({ id, data }) => [id, data.machineCode]));
  const now = requestTime();
  const due = [...open].sort((a, b) => a.data.dueAtMs - b.data.dueAtMs);
  const owedKes = due.reduce((sum, { data }) => sum + data.totalKes, 0);
  const overdueKes = due.filter(({ data }) => data.dueAtMs < now).reduce((sum, { data }) => sum + data.totalKes, 0);
  const byOwner = new Map<string, { owedKes: number; count: number; oldestDueMs: number }>();
  for (const { data } of due) {
    const row = byOwner.get(data.partnerId) ?? { owedKes: 0, count: 0, oldestDueMs: data.dueAtMs };
    byOwner.set(data.partnerId, { owedKes: row.owedKes + data.totalKes, count: row.count + 1, oldestDueMs: Math.min(row.oldestDueMs, data.dueAtMs) });
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Owner invoices</h1>
        <p className="text-sm text-muted-foreground">
          {due.length === 0 ? 'Nothing owed right now.' : `${kes(owedKes)} owed on ${due.length} invoice${due.length === 1 ? '' : 's'}${overdueKes > 0 ? `, ${kes(overdueKes)} of it overdue` : ''}.`} Owners on invoice billing get one for each delivery of snacks and each fee period, and pay by M-Pesa in their portal.
        </p>
      </div>

      {needsStaff.length > 0 ? (
        <Card className="border-danger/40">
          <CardContent className="flex flex-col gap-2 p-4">
            <p className="flex items-center gap-2 font-medium text-danger">
              <AlertTriangle className="size-4" aria-hidden="true" />
              M-Pesa payments to return or apply
            </p>
            <ul className="flex flex-col gap-1 text-sm text-foreground">
              {needsStaff.map(({ id, data }) => (
                <li key={id}>
                  KES {(data.paidAmountKes ?? data.amountKes).toLocaleString('en-KE')} from {data.phone}
                  {data.mpesaReceiptNumber ? `, receipt ${data.mpesaReceiptNumber}` : ''} — {data.outcome === 'already_settled' ? 'its invoice was already paid or cancelled' : 'not the invoice amount'} ({day.format(data.requestedAtMs)})
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {byOwner.size > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Who owes what</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {[...byOwner.entries()]
                .sort((a, b) => b[1].owedKes - a[1].owedKes)
                .map(([partnerId, row]) => (
                  <li key={partnerId}>
                    <Link href={`/admin/vending/partners/${partnerId}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-border/20 sm:px-6">
                      <span className="flex flex-col">
                        <span className="font-medium text-foreground">{names.get(partnerId) ?? partnerId}</span>
                        <span className="text-muted-foreground">
                          {row.count} unpaid · oldest due {day.format(row.oldestDueMs)}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 font-semibold tabular-nums text-foreground">
                        {kes(row.owedKes)}
                        {row.oldestDueMs < now ? <Badge variant="danger">Overdue</Badge> : null}
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="unpaid">
        <h2 id="unpaid" className="text-lg font-semibold text-foreground">Unpaid</h2>
        {due.length === 0 ? (
          <EmptyState icon={ReceiptText} title="No unpaid invoices" description="Set an owner’s agreement to invoice billing and their deliveries and management fees are invoiced here and in their portal." />
        ) : (
          due.map(({ id, data }) => (
            <Card key={id}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {data.number} · {OWNER_INVOICE_KIND_LABEL[data.kind]} · {kes(data.totalKes)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {names.get(data.partnerId) ?? data.partnerId} · {codes.get(data.machineId) ?? data.machineId} · issued {day.format(data.issuedAtMs)}
                    </p>
                  </div>
                  <Badge variant={data.dueAtMs < now ? 'danger' : 'warning'}>{data.dueAtMs < now ? 'Overdue' : `Due ${day.format(data.dueAtMs)}`}</Badge>
                </div>
                <ul className="text-sm text-muted-foreground">
                  {data.lines.map((line, index) => (
                    <li key={index}>
                      {line.description}
                      {line.quantity !== null && line.unitKes !== null ? ` — ${line.quantity} × KES ${line.unitKes.toLocaleString('en-KE')}` : ''} = {kes(line.amountKes)}
                    </li>
                  ))}
                </ul>
                {data.unpricedUnits > 0 ? (
                  <p className="text-sm text-warning">
                    {data.unpricedUnits} delivered unit{data.unpricedUnits === 1 ? '' : 's'} had no owner price, so {data.unpricedUnits === 1 ? 'it isn’t' : 'they aren’t'} on this invoice.
                  </p>
                ) : null}
                {data.pendingPrompt ? <p className="text-sm text-muted-foreground">M-Pesa prompt sent to {data.pendingPrompt.phone} at {new Date(data.pendingPrompt.requestedAtMs).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' })}.</p> : null}
                {canManage ? <OwnerInvoiceActions invoiceId={id} number={data.number} totalKes={data.totalKes} /> : null}
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {settled.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="settled">
          <h2 id="settled" className="text-lg font-semibold text-foreground">Paid or cancelled, last {SETTLED_DAYS} days</h2>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {settled.map(({ id, data }) => (
                  <li key={id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-6">
                    <span className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {data.number} · {names.get(data.partnerId) ?? data.partnerId} · {codes.get(data.machineId) ?? data.machineId}
                      </span>
                      <span className="text-muted-foreground">
                        {data.status === 'paid' && data.payment
                          ? `${data.payment.method === 'mpesa' ? 'M-Pesa' : `Recorded by ${data.payment.recordedBy ?? 'staff'}`}${data.payment.reference ? ` · ${data.payment.reference}` : ''} · ${day.format(data.payment.paidAtMs)}`
                          : `Cancelled: ${data.voidReason ?? ''}`}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 tabular-nums">
                      <span className={data.status === 'void' ? 'text-muted-foreground line-through' : 'text-foreground'}>{kes(data.totalKes)}</span>
                      {data.status === 'paid' ? <Badge variant="success">Paid</Badge> : <Badge variant="outline">Cancelled</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

/** The request's own clock — read once, outside render, so every invoice is judged against the same instant. */
function requestTime(): number {
  return Date.now();
}
