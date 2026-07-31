'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

/**
 * The warehouse's one order action (§ Warehouse workspace): pack the
 * box, then mark it dispatched. Deliberately narrower than
 * `OrderStatusActions` (§ Admin: Orders), which also exposes
 * cancel/refund-request — those stay admin-only decisions, not
 * something this workspace's real job (fulfillment) needs to trigger.
 * Same real transition and route (`confirmed` → `dispatched` via
 * `POST /api/admin/orders/[orderId]/status`), just a smaller surface.
 */
export function MarkDispatchedButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (!window.confirm('Mark this order as dispatched? Only do this once it has been handed to the courier or picked up.')) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'dispatched' }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not update this order.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this order.');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={onClick} loading={submitting}>
        Mark dispatched
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
