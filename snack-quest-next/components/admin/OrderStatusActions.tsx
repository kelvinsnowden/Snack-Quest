'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, type ButtonProps } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ORDER_STATUS_LABELS, VALID_ORDER_TRANSITIONS } from '@/lib/orders/transitions';
import type { OrderStatus } from '@/types';

const VARIANT_FOR_TARGET: Record<OrderStatus, ButtonProps['variant']> = {
  pending: 'outline',
  confirmed: 'primary',
  dispatched: 'primary',
  delivered: 'secondary',
  cancelled: 'danger',
  refund_requested: 'outline',
};

// A reason is required for the two transitions that need a documented
// justification for anyone reviewing the order later — every other
// transition is routine fulfillment progress and doesn't need one.
const REASON_REQUIRED: Partial<Record<OrderStatus, boolean>> = {
  cancelled: true,
  refund_requested: true,
};

export function OrderStatusActions({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const router = useRouter();
  const [target, setTarget] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextStatuses = VALID_ORDER_TRANSITIONS[status];
  if (nextStatuses.length === 0) {
    return null;
  }

  function openDialog(next: OrderStatus) {
    setTarget(next);
    setReason('');
    setError(null);
  }

  function closeDialog() {
    if (submitting) return;
    setTarget(null);
  }

  async function confirm() {
    if (!target) return;
    if (REASON_REQUIRED[target] && !reason.trim()) {
      setError('A reason is required for this change.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: target, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not update this order.');
      }
      setTarget(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this order.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {nextStatuses.map((next) => (
          <Button key={next} variant={VARIANT_FOR_TARGET[next]} size="sm" onClick={() => openDialog(next)}>
            Mark as {ORDER_STATUS_LABELS[next]}
          </Button>
        ))}
      </div>

      <Dialog open={target !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          {target ? (
            <>
              <DialogHeader>
                <DialogTitle>Mark order as {ORDER_STATUS_LABELS[target]}?</DialogTitle>
                <DialogDescription>
                  This updates the order status immediately and is recorded in the order&apos;s audit log.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 flex flex-col gap-1.5">
                <Label htmlFor="status-reason">
                  Reason {REASON_REQUIRED[target] ? '' : <span className="text-muted-foreground">(optional)</span>}
                </Label>
                <Textarea
                  id="status-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="e.g. Customer requested cancellation"
                  aria-invalid={Boolean(error) || undefined}
                />
                {error ? <p className="text-xs text-danger">{error}</p> : null}
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={closeDialog} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  variant={VARIANT_FOR_TARGET[target]}
                  onClick={confirm}
                  loading={submitting}
                >
                  Confirm
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
