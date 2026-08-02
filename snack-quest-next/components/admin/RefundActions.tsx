'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

/**
 * The one real, money-moving refund action (§ RefundService + Daraja
 * reversal support) — only rendered by the order detail page when
 * `order.status === 'refund_requested'` and no refund is already
 * processing/succeeded for this order (the Service enforces both,
 * this is just when it makes sense to show the button at all).
 */
export function RefundActions({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (
      !window.confirm(
        'Initiate a real M-Pesa refund for this order? This reverses the original payment via Safaricom and cannot be undone.',
      )
    ) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/refund`, { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not initiate this refund.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not initiate this refund.');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="danger" size="sm" onClick={onClick} loading={submitting}>
        Initiate M-Pesa refund
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
