import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Truck } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { shipmentRepository } from '@/repositories/shipmentRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ShipmentStatusBadge } from '@/components/admin/ShipmentStatusBadge';
import { ShipmentStatusActions } from '@/components/admin/ShipmentStatusActions';
import { CompleteManualBookingDialog } from '@/components/admin/CompleteManualBookingDialog';
import { formatDateTime } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Shipment detail' };

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export default async function AdminShipmentDetailPage({
  params,
}: {
  params: Promise<{ shipmentId: string }>;
}) {
  const session = await requireStaffSession();
  const { shipmentId } = await params;

  const shipment = await shipmentRepository.findById(session.businessId, shipmentId);
  if (!shipment) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/admin/deliveries"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Deliveries
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-page-title font-bold tracking-tight text-foreground">{shipment.recipientName}</h1>
            <ShipmentStatusBadge status={shipment.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {shipment.recipientPhone} · {shipment.county}
          </p>
        </div>
        {shipment.status === 'pending_manual_booking' ? (
          <CompleteManualBookingDialog shipmentId={shipmentId} />
        ) : (
          <ShipmentStatusActions shipmentId={shipmentId} status={shipment.status} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <DetailRow label="Order" value={<Link href={`/admin/orders/${shipment.orderId}`} className="text-primary hover:underline">View order</Link>} />
            <DetailRow label="Provider" value={<span className="capitalize">{shipment.provider}</span>} />
            <DetailRow label="Method" value={<span className="capitalize">{shipment.method}</span>} />
            <DetailRow label="Address" value={shipment.addressText ?? '—'} />
            <DetailRow label="Courier reference" value={<span className="text-xs tabular-nums">{shipment.courierShipmentRef ?? '—'}</span>} />
            <DetailRow
              label="Tracking URL"
              value={
                shipment.trackingUrl ? (
                  <a href={shipment.trackingUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    Open
                  </a>
                ) : (
                  '—'
                )
              }
            />
            <DetailRow label="Created" value={formatDateTime(shipment.createdAt)} />
            {shipment.deliveredAt ? <DetailRow label="Delivered" value={formatDateTime(shipment.deliveredAt)} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tracking history</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {shipment.trackingEvents.length === 0 ? (
              <EmptyState
                icon={Truck}
                title="No tracking updates yet"
                description="Real-time updates appear here once the courier's tracking webhook reports one."
                className="border-0 py-10"
              />
            ) : (
              <div className="divide-y divide-border">
                {[...shipment.trackingEvents]
                  .sort((a, b) => (a.occurredAt as unknown as { toMillis: () => number }).toMillis() - (b.occurredAt as unknown as { toMillis: () => number }).toMillis())
                  .reverse()
                  .map((event, index) => (
                    <div key={index} className="flex items-baseline justify-between gap-4 px-6 py-3 text-sm">
                      <div>
                        <p className="font-medium text-foreground capitalize">{event.status.replace(/_/g, ' ')}</p>
                        {event.description ? <p className="text-caption text-muted-foreground">{event.description}</p> : null}
                      </div>
                      <span className="shrink-0 text-caption text-muted-foreground tabular-nums">{formatDateTime(event.occurredAt)}</span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
