import type { Metadata } from 'next';
import { CheckCircle2, ReceiptText } from 'lucide-react';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { ownerInvoiceService } from '@/services/ownerInvoiceService';
import { partnerService } from '@/services/partnerService';
import { InvoicePayButton } from '@/components/partner/InvoicePayButton';
import { TrendStatCard } from '@/components/admin/TrendStatCard';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { OWNER_INVOICE_KIND_LABEL, type OwnerInvoice } from '@/types';

export const metadata: Metadata = { title: 'Invoices' };

const date = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric' });
const kes = (amount: number) => `KES ${amount.toLocaleString('en-KE')}`;

/** `2547…` → `07…`, the way people type their own number. */
function localPhone(phone: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('254') && digits.length === 12 ? `0${digits.slice(3)}` : phone;
}

/**
 * § OWNER BILLING — what the owner owes Snack Quest for snacks delivered to
 * their machines and the management fee, and paying it by M-Pesa. Unpaid
 * first, oldest due first; then what's been paid.
 */
export default async function PartnerInvoicesPage() {
  const session = await requirePartnerSession();
  const [invoices, machines, partner] = await Promise.all([
    ownerInvoiceService.listForPartner(session.businessId, session.partnerId),
    partnerService.listMachines(session.businessId, session.partnerId),
    partnerService.findById(session.businessId, session.partnerId),
  ]);
  const machineCode = new Map(machines.map(({ id, data }) => [id, data.machineCode]));
  const open = invoices.filter(({ data }) => data.status === 'open').sort((a, b) => a.data.dueAtMs - b.data.dueAtMs);
  const settled = invoices.filter(({ data }) => data.status !== 'open');
  const owedKes = open.reduce((sum, { data }) => sum + data.totalKes, 0);
  const paidKes = settled.reduce((sum, { data }) => sum + (data.status === 'paid' ? data.totalKes : 0), 0);
  const now = requestTime();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
        <p className="text-sm text-muted-foreground">Snacks delivered to your machines and the management fee. Pay each one by M-Pesa.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TrendStatCard label="To pay" value={kes(owedKes)} icon={<ReceiptText className="size-4" aria-hidden="true" />} tone={owedKes > 0 ? 'warning' : 'success'} />
        <TrendStatCard label="Paid" value={kes(paidKes)} icon={<CheckCircle2 className="size-4" aria-hidden="true" />} tone="success" />
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="unpaid">
        <h2 id="unpaid" className="text-lg font-semibold text-foreground">To pay</h2>
        {open.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nothing to pay. New invoices appear here, and we text you when one arrives.</p>
        ) : (
          open.map(({ id, data }) => (
            <Card key={id}>
              <CardContent className="flex flex-col gap-4 p-4">
                <InvoiceHeader invoice={data} machine={machineCode.get(data.machineId) ?? data.machineId}>
                  <Badge variant={data.dueAtMs < now ? 'danger' : 'warning'}>{data.dueAtMs < now ? `Overdue since ${date.format(data.dueAtMs)}` : `Due ${date.format(data.dueAtMs)}`}</Badge>
                </InvoiceHeader>
                <InvoiceLines invoice={data} />
                <InvoicePayButton invoiceId={id} totalKes={data.totalKes} defaultPhone={localPhone(partner?.contactPhone ?? null)} />
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {settled.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="paid">
          <h2 id="paid" className="text-lg font-semibold text-foreground">Paid and cancelled</h2>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {settled.map(({ id, data }) => (
                <details key={id} className="group px-4 py-3">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <span className="min-w-0">
                      <span className="font-medium text-foreground">{data.number}</span>
                      <span className="text-sm text-muted-foreground"> · {OWNER_INVOICE_KIND_LABEL[data.kind]} · {machineCode.get(data.machineId) ?? data.machineId}</span>
                    </span>
                    <span className="flex items-center gap-2 text-sm">
                      <span className={data.status === 'void' ? 'text-muted-foreground line-through' : 'font-semibold text-foreground'}>{kes(data.totalKes)}</span>
                      {data.status === 'paid' ? <Badge variant="success">Paid {data.payment ? date.format(data.payment.paidAtMs) : ''}</Badge> : <Badge variant="outline">Cancelled</Badge>}
                    </span>
                  </summary>
                  <div className="mt-3 flex flex-col gap-2">
                    <InvoiceLines invoice={data} />
                    {data.payment?.reference ? <p className="text-xs text-muted-foreground">{data.payment.method === 'mpesa' ? 'M-Pesa receipt' : 'Payment reference'}: {data.payment.reference}</p> : null}
                    {data.voidReason ? <p className="text-xs text-muted-foreground">Cancelled: {data.voidReason}</p> : null}
                  </div>
                </details>
              ))}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

function InvoiceHeader({ invoice, machine, children }: { invoice: OwnerInvoice; machine: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-semibold text-foreground">
          {invoice.number} · {OWNER_INVOICE_KIND_LABEL[invoice.kind]}
        </p>
        <p className="text-xs text-muted-foreground">
          {machine} · issued {date.format(invoice.issuedAtMs)}
        </p>
      </div>
      {children}
    </div>
  );
}

function InvoiceLines({ invoice }: { invoice: OwnerInvoice }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">What {invoice.number} is for</caption>
      <tbody>
        {invoice.lines.map((line, index) => (
          <tr key={index} className="align-top">
            <td className="py-1 pr-3 text-foreground">
              {line.description}
              {line.quantity !== null && line.unitKes !== null ? (
                <span className="block text-xs text-muted-foreground">
                  {line.quantity} × KES {line.unitKes.toLocaleString('en-KE')}
                </span>
              ) : null}
            </td>
            <td className="py-1 text-right tabular-nums text-foreground">{kes(line.amountKes)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-border">
          <th scope="row" className="pt-2 text-left font-semibold text-foreground">
            Total
          </th>
          <td className="pt-2 text-right font-semibold tabular-nums text-foreground">{kes(invoice.totalKes)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/** The request's own clock — read once, outside render, so every invoice is judged against the same instant. */
function requestTime(): number {
  return Date.now();
}
