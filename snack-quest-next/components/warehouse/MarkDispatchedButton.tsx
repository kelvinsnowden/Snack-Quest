'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

/**
 * The warehouse's order actions (§ Warehouse workspace): pack the box
 * and mark it dispatched, then close it out as delivered once it has
 * arrived.
 *
 * Both halves of the job, because this workspace owns fulfillment to
 * the end. It was dispatch alone, which meant an order left this
 * workspace the moment it left the building and somebody with the full
 * Admin portal had to finish it.
 *
 * Deliberately still narrower than `OrderStatusActions` (§ Admin:
 * Orders), which also exposes cancel and refund-request. Those stay
 * admin decisions — they are about money, not about fulfillment.
 *
 * The same real transitions and route the Admin portal uses
 * (`POST /api/admin/orders/[orderId]/status`), just a smaller surface.
 */
const ACTIONS = {
  dispatched: {
    label: 'Mark dispatched',
    confirm:
      'Mark this order as dispatched? Only do this once it has been handed to the courier or picked up.',
  },
  delivered: {
    label: 'Mark delivered',
    confirm: 'Mark this order as delivered? Only do this once the customer actually has it.',
  },
} as const;

export function MarkDispatchedButton({
  orderId,
  to = 'dispatched',
}: {
  orderId: string;
  to?: keyof typeof ACTIONS;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (!window.confirm(ACTIONS[to].confirm)) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: to }),
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
        {ACTIONS[to].label}
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
