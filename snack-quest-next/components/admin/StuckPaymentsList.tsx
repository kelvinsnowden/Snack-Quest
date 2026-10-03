import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { CompleteManuallyForm } from '@/components/admin/CompleteManuallyForm';
import type { StuckPayment } from '@/services/stuckPaymentService';

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

/**
 * Every payment a customer may have made that never became an order
 * (§ payment reconciliation: stuck payments), with what they bought and
 * a way to finish it: type the M-Pesa receipt from the statement or SMS
 * and it becomes a normal order, picks and all.
 */
export function StuckPaymentsList({
  payments,
  canComplete,
  lastCheck,
}: {
  payments: StuckPayment[];
  canComplete: boolean;
  lastCheck: { startedAt: string | null; status: string } | null;
}) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <p className="text-card-title font-semibold text-foreground">Waiting for payment confirmation</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Customers who were sent an M-Pesa prompt but whose result never reached us, so no order was created. If the money arrived, enter the
          M-Pesa receipt and the order is created with everything they chose.
        </p>
        <p className={`mt-2 flex items-center gap-1.5 text-caption ${lastCheck ? 'text-muted-foreground' : 'text-warning'}`}>
          <Clock className="size-3.5" aria-hidden="true" />
          {lastCheck?.startedAt
            ? `Automatic overnight check last ran ${when(lastCheck.startedAt)} (${lastCheck.status}).`
            : 'The automatic overnight check has never run. Use “Check now” below, and ask whoever manages hosting to check the scheduled jobs.'}
        </p>
      </div>

      {payments.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
          Nothing waiting. Every payment in the last 30 days either became an order or was declined.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border border-t border-border">
          {payments.map((payment) => (
            <li key={payment.intentId} className="flex flex-col gap-1 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  {payment.customerName ?? 'Unknown customer'} · {payment.phoneNumber}
                </span>
                <span className="text-sm font-semibold tabular-nums text-foreground">KES {payment.amountKes.toLocaleString('en-KE')}</span>
              </div>
              <span className="text-caption text-muted-foreground">
                {payment.boxLabel ?? 'Checkout details missing'} · started {when(payment.startedAt)}
                {payment.picks.length > 0 ? ` · picks: ${payment.picks.join(', ')}` : ''}
              </span>
              <span className={`flex items-center gap-1.5 text-caption ${payment.safaricomConfirmed ? 'text-success' : 'text-warning'}`}>
                {payment.safaricomConfirmed ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <AlertTriangle className="size-3.5" aria-hidden="true" />}
                {payment.safaricomConfirmed
                  ? 'Safaricom confirmed this payment succeeded. Enter the receipt to create the order.'
                  : payment.status === 'expired'
                    ? 'Safaricom never gave a result. Check your M-Pesa statement before marking it paid.'
                    : 'No result from Safaricom yet. Press “Check now”, or check your M-Pesa statement.'}
              </span>
              {canComplete ? (
                <CompleteManuallyForm intentId={payment.intentId} />
              ) : (
                <span className="text-caption text-muted-foreground">Someone with permission to reconcile payments can mark this as paid.</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
