'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, type ButtonProps } from '@/components/ui/button';
import { SHIPMENT_STATUS_LABELS, VALID_SHIPMENT_TRANSITIONS } from '@/lib/delivery/transitions';
import type { ShipmentStatus } from '@/types';

const VARIANT_FOR_TARGET: Record<ShipmentStatus, ButtonProps['variant']> = {
  pending: 'outline',
  pending_manual_booking: 'outline',
  created: 'outline',
  in_transit: 'secondary',
  delivered: 'primary',
  failed: 'danger',
};

/** For `created`/`in_transit`/`pending` shipments — manual booking uses `CompleteManualBookingDialog` instead. */
export function ShipmentStatusActions({ shipmentId, status }: { shipmentId: string; status: ShipmentStatus }) {
  const router = useRouter();
  const [pendingTarget, setPendingTarget] = useState<ShipmentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nextStatuses = VALID_SHIPMENT_TRANSITIONS[status];
  if (nextStatuses.length === 0) {
    return null;
  }

  async function transitionTo(next: ShipmentStatus) {
    setPendingTarget(next);
    setError(null);
    try {
      const response = await fetch(`/api/admin/shipments/${shipmentId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not update this shipment.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this shipment.');
    } finally {
      setPendingTarget(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {nextStatuses.map((next) => (
          <Button
            key={next}
            variant={VARIANT_FOR_TARGET[next]}
            size="sm"
            loading={pendingTarget === next}
            disabled={pendingTarget !== null && pendingTarget !== next}
            onClick={() => transitionTo(next)}
          >
            Mark {SHIPMENT_STATUS_LABELS[next]}
          </Button>
        ))}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
