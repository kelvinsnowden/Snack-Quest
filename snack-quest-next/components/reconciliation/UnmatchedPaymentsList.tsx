import { Inbox } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ResolveUnmatchedPaymentDialog } from '@/components/admin/ResolveUnmatchedPaymentDialog';
import { parseStkPayload } from '@/lib/reconciliation/parseStkPayload';
import { formatDateTime, formatKes } from '@/lib/orders/format';
import type { WebhookEvent } from '@/types';

/**
 * Real M-Pesa STK callbacks Safaricom sent us that never matched a
 * known payment attempt (§ Payment reconciliation) — shared between
 * `/admin/reconciliation` and `/finance/reconciliation`, same real
 * `webhookEventRepository.listUnmatchedPayments` data either way.
 */
export function UnmatchedPaymentsList({ events }: { events: { id: string; data: WebhookEvent }[] }) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No unmatched payments"
        description="Every STK callback Safaricom has sent has matched a known payment attempt. Nothing to reconcile."
      />
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Received</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">M-Pesa receipt</th>
              <th className="px-4 py-3 font-medium">Result</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {events.map(({ id, data }) => {
              const parsed = parseStkPayload(data.payload);
              return (
                <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDateTime(data.receivedAt)}</td>
                  <td className="px-4 py-3 tabular-nums text-foreground">{parsed.phoneNumber ?? '—'}</td>
                  <td className="px-4 py-3 font-medium tabular-nums text-foreground">
                    {parsed.amountKes !== null ? formatKes(parsed.amountKes) : '—'}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-foreground">{parsed.mpesaReceiptNumber ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{parsed.resultDesc ?? data.error ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {data.resolvedBy ? (
                      <Badge variant="success">Resolved</Badge>
                    ) : (
                      <ResolveUnmatchedPaymentDialog providerEventId={data.providerEventId} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
