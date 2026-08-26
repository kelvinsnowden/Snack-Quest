'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

/**
 * The prompt sent at the door for an order the customer is paying for
 * on delivery (§ pay on delivery).
 *
 * Pressed while standing in front of somebody, so it says what will
 * happen to their phone and what it will ask for, and it can be
 * pressed again: doorstep prompts time out, and a second press is a
 * second prompt rather than a second charge. Only the first payment to
 * arrive settles the order.
 *
 * The order does not update the moment this returns — it updates when
 * the customer finishes paying and Safaricom calls back — so the
 * success line says a prompt is on its way rather than pretending the
 * money has landed.
 */
export function CollectPaymentButton({
  orderId,
  amountKes,
  phoneNumber,
}: {
  orderId: string;
  amountKes: number;
  phoneNumber: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onClick() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/collect-payment`, {
        method: 'POST',
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? 'Could not send the prompt.');
      }
      setSent(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the prompt.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={onClick} loading={submitting}>
        {sent ? 'Send the prompt again' : `Collect KES ${amountKes.toLocaleString()}`}
      </Button>
      {sent && !error ? (
        <p className="text-caption text-muted-foreground">
          Prompt sent to {phoneNumber}. This clears once they pay.
        </p>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
