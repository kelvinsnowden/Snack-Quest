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

export function CompleteManualBookingDialog({ shipmentId }: { shipmentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [courierShipmentRef, setCourierShipmentRef] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCourierShipmentRef('');
    setTrackingUrl('');
    setError(null);
  }

  async function onSubmit() {
    if (!courierShipmentRef.trim()) {
      setError('Enter the courier booking reference.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/shipments/${shipmentId}/complete-booking`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          courierShipmentRef: courierShipmentRef.trim(),
          trackingUrl: trackingUrl.trim() || null,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not save this booking.');
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this booking.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button size="sm" onClick={() => setOpen(true)}>
        Complete booking
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete manual booking</DialogTitle>
          <DialogDescription>Record what the courier gave you after booking this delivery externally.</DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="courierShipmentRef">Booking reference</Label>
            <Input
              id="courierShipmentRef"
              value={courierShipmentRef}
              onChange={(event) => setCourierShipmentRef(event.target.value)}
              placeholder="e.g. Bolt trip ID"
              aria-invalid={Boolean(error) || undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trackingUrl">
              Tracking link <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="trackingUrl"
              value={trackingUrl}
              onChange={(event) => setTrackingUrl(event.target.value)}
              placeholder="https://..."
            />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={submitting}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
