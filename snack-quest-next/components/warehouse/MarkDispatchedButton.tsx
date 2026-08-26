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
/**
 * Completing the job means different things for different orders
 * (§ complete the delivery by order type), so the button says the one
 * that applies rather than a generic "delivered" the packer has to
 * translate. Somebody carrying a box to a door and somebody handing it
 * over a counter are confirming different events.
 */
function actionFor(
  to: 'dispatched' | 'delivered',
  method: 'pickup' | 'door' | undefined,
  outstandingKes: number,
): { label: string; confirm: string } {
  if (to === 'dispatched') {
    return method === 'pickup'
      ? {
          label: 'Sent to pickup point',
          confirm:
            'Mark this order as on its way to the pickup point? Only do this once it has left with the courier.',
        }
      : {
          label: 'Out for delivery',
          confirm:
            'Mark this order as out for delivery? Only do this once it has left with whoever is delivering it.',
        };
  }

  /*
   * Money still owed is stated in the confirmation itself. Marking an
   * order delivered is the last moment anyone looks at it, so an
   * outstanding balance that is not said here is one nobody goes back
   * for. Not blocked outright — a customer may have paid in cash, and
   * stranding a delivered box in the queue helps nobody — but it
   * cannot be done without reading the number.
   */
  const owed =
    outstandingKes > 0
      ? ` KES ${outstandingKes.toLocaleString()} is still unpaid on it — collect that first unless it has already been settled.`
      : '';

  return method === 'pickup'
    ? {
        label: 'Customer collected it',
        confirm: `Mark this order as collected? Only do this once the customer actually has it.${owed}`,
      }
    : {
        label: 'Delivered',
        confirm: `Mark this order as delivered? Only do this once the customer actually has it.${owed}`,
      };
}

export function MarkDispatchedButton({
  orderId,
  to = 'dispatched',
  deliveryMethod,
  outstandingKes = 0,
}: {
  orderId: string;
  to?: 'dispatched' | 'delivered';
  deliveryMethod?: 'pickup' | 'door';
  /** Still owed on this order, so the confirmation can say so. */
  outstandingKes?: number;
}) {
  const action = actionFor(to, deliveryMethod, outstandingKes);
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (!window.confirm(action.confirm)) {
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
    <div className="flex flex-col gap-1 sm:items-end">
      <Button size="sm" onClick={onClick} loading={submitting} className="w-full sm:w-auto">
        {action.label}
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
