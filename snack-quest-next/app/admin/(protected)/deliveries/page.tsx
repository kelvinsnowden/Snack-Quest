import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffSession } from '@/lib/auth/session';
import { deliveryService } from '@/services/deliveryService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyShipmentsState } from '@/components/admin/EmptyShipmentsState';
import { ShipmentStatusBadge } from '@/components/admin/ShipmentStatusBadge';
import { ShipmentStatusActions } from '@/components/admin/ShipmentStatusActions';
import { CompleteManualBookingDialog } from '@/components/admin/CompleteManualBookingDialog';
import { SHIPMENT_STATUS_LABELS } from '@/lib/delivery/transitions';
import type { ShipmentStatus } from '@/types';

export const metadata: Metadata = { title: 'Deliveries' };

const STATUS_FILTERS: ShipmentStatus[] = [
  'pending_manual_booking',
  'pending',
  'created',
  'in_transit',
  'delivered',
  'failed',
];

export default async function AdminDeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
  const session = await requireStaffSession();
  const { status, cursor } = await searchParams;
  const validStatus = STATUS_FILTERS.includes(status as ShipmentStatus) ? (status as ShipmentStatus) : undefined;

  const { shipments, nextCursor } = await deliveryService.listShipments(session.businessId, {
    status: validStatus,
    cursor,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Deliveries</h1>
        <p className="mt-1 text-sm text-muted-foreground">Track shipments and complete manual courier bookings.</p>
      </div>

      <Card className="flex flex-wrap gap-2 p-4">
        <Link
          href="/admin/deliveries"
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            !status ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
          }`}
        >
          All
        </Link>
        {STATUS_FILTERS.map((value) => (
          <Link
            key={value}
            href={`/admin/deliveries?status=${value}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              status === value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
            }`}
          >
            {SHIPMENT_STATUS_LABELS[value]}
          </Link>
        ))}
      </Card>

      {shipments.length === 0 ? (
        <EmptyShipmentsState hasFilter={Boolean(status)} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Recipient</th>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium">County</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {shipments.map(({ id, data }) => (
                  <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                    <td className="px-4 py-3">
                      <Link href={`/admin/deliveries/${id}`} className="block">
                        <span className="font-medium text-foreground">{data.recipientName}</span>
                        <span className="block text-caption text-muted-foreground tabular-nums">{data.recipientPhone}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-foreground capitalize">
                      {data.provider} · {data.method}
                    </td>
                    <td className="px-4 py-3 text-foreground">{data.county}</td>
                    <td className="px-4 py-3">
                      <ShipmentStatusBadge status={data.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {data.status === 'pending_manual_booking' ? (
                        <CompleteManualBookingDialog shipmentId={id} />
                      ) : (
                        <ShipmentStatusActions shipmentId={id} status={data.status} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href={`/admin/deliveries?${status ? `status=${status}&` : ''}cursor=${nextCursor}`}>Load more</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
