'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { PurchaseOrder } from '@/types';

async function post(url: string, body?: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: data?.error ?? 'Something went wrong.' };
  }
  return { ok: true };
}

export function PurchaseOrderActions({
  purchaseOrderId,
  status,
  lineItems,
}: {
  purchaseOrderId: string;
  status: PurchaseOrder['status'];
  lineItems: { packageId: string; description: string }[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [expiresAtByPackageId, setExpiresAtByPackageId] = useState<Record<string, string>>({});

  async function markOrdered() {
    setSubmitting(true);
    setError(null);
    const result = await post(`/api/admin/purchase-orders/${purchaseOrderId}/order`);
    if (!result.ok) {
      setError(result.error);
    } else {
      router.refresh();
    }
    setSubmitting(false);
  }

  async function cancel() {
    setSubmitting(true);
    setError(null);
    const result = await post(`/api/admin/purchase-orders/${purchaseOrderId}/cancel`, { reason: cancelReason.trim() || undefined });
    if (!result.ok) {
      setError(result.error);
    } else {
      setCancelOpen(false);
      router.refresh();
    }
    setSubmitting(false);
  }

  async function receive() {
    setSubmitting(true);
    setError(null);
    const result = await post(`/api/admin/purchase-orders/${purchaseOrderId}/receive`, {
      expiresAtByPackageId: Object.fromEntries(
        lineItems.map((item) => [item.packageId, expiresAtByPackageId[item.packageId] || null]),
      ),
    });
    if (!result.ok) {
      setError(result.error);
    } else {
      setReceiveOpen(false);
      router.refresh();
    }
    setSubmitting(false);
  }

  if (status === 'draft') {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <Button size="sm" onClick={markOrdered} loading={submitting}>
            Mark as ordered
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)} disabled={submitting}>
            Cancel
          </Button>
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <CancelDialog open={cancelOpen} setOpen={setCancelOpen} reason={cancelReason} setReason={setCancelReason} onConfirm={cancel} submitting={submitting} />
      </div>
    );
  }

  if (status === 'ordered') {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setReceiveOpen(true)} disabled={submitting}>
            Receive
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)} disabled={submitting}>
            Cancel
          </Button>
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}

        <CancelDialog open={cancelOpen} setOpen={setCancelOpen} reason={cancelReason} setReason={setCancelReason} onConfirm={cancel} submitting={submitting} />

        <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Receive purchase order</DialogTitle>
              <DialogDescription>
                Creates a real batch and increments stock for each line item. Enter the real expiry date read off the delivery, if any.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex flex-col gap-3">
              {lineItems.map((item) => (
                <div key={item.packageId} className="flex items-center justify-between gap-3">
                  <Label htmlFor={`expiry-${item.packageId}`} className="flex-1">
                    {item.description}
                  </Label>
                  <Input
                    id={`expiry-${item.packageId}`}
                    type="date"
                    className="w-40"
                    value={expiresAtByPackageId[item.packageId] ?? ''}
                    onChange={(event) =>
                      setExpiresAtByPackageId((prev) => ({ ...prev, [item.packageId]: event.target.value }))
                    }
                  />
                </div>
              ))}
              {error ? <p className="text-sm text-danger">{error}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setReceiveOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={receive} loading={submitting}>
                Confirm receipt
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return null;
}

function CancelDialog({
  open,
  setOpen,
  reason,
  setReason,
  onConfirm,
  submitting,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  reason: string;
  setReason: (value: string) => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this purchase order?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="cancel-reason">
            Reason <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea id="cancel-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Keep it
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={submitting}>
            Cancel purchase order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
