import type { Metadata } from 'next';
import Link from 'next/link';
import { PackageCheck, Truck } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { orderRepository } from '@/repositories/orderRepository';
import { shipmentRepository } from '@/repositories/shipmentRepository';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ShipmentStatusBadge } from '@/components/admin/ShipmentStatusBadge';
import { CompleteManualBookingDialog } from '@/components/admin/CompleteManualBookingDialog';
import { MarkDispatchedButton } from '@/components/warehouse/MarkDispatchedButton';
import { formatDate } from '@/lib/orders/format';
import { OrderPackingList } from '@/components/warehouse/OrderPackingList';
import { CollectPaymentButton } from '@/components/warehouse/CollectPaymentButton';

export const metadata: Metadata = { title: 'Queue' };

/**
 * The Warehouse workspace's home queue (§ Warehouse workspace). The
 * real order lifecycle (`types/order.ts`) has no separate "packing" or
 * "curating" status — an order goes `confirmed` → `dispatched` directly
 * — so this workspace doesn't invent a fake intermediate Firestore
 * state. "To pack" below IS the packing queue: every `confirmed` order
 * needs its box packed and, once handed to the courier or picked up,
 * marked dispatched (the one real transition this workspace exposes).
 * "Ready for courier" reuses the same `pending_manual_booking` shipment
 * queue as Admin: Delivery monitoring — no separate backend, just a
 * focused view of it. "Out for delivery" is the `dispatched` orders,
 * so the job can be closed out here rather than needing the full Admin
 * portal once the box has left the building.
 */
export default async function WarehouseQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ packCursor?: string; courierCursor?: string; outCursor?: string }>;
}) {
  const session = await requireStaffSession();
  const { packCursor, courierCursor, outCursor } = await searchParams;

  const [toPack, readyForCourier, outForDelivery] = await Promise.all([
    orderRepository.listByBusiness(session.businessId, { status: 'confirmed', cursor: packCursor }),
    shipmentRepository.listByBusiness(session.businessId, {
      status: 'pending_manual_booking',
      cursor: courierCursor,
    }),
    // Dispatched but not yet in the customer's hands. Without this the
    // order left this workspace the moment it left the building, and
    // somebody with the full Admin portal had to close it out.
    orderRepository.listByBusiness(session.businessId, { status: 'dispatched', cursor: outCursor }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">Orders to pack, deliveries waiting on a courier, and boxes still out with a customer.</p>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">To pack</h2>
          <span className="rounded-full bg-border/40 px-2 py-0.5 text-caption text-muted-foreground">
            {toPack.orders.length}
          </span>
        </div>

        {toPack.orders.length === 0 ? (
          <EmptyState icon={PackageCheck} title="Nothing to pack right now" description="Paid orders waiting to be boxed up will show here." />
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Boxes and contents</th>
                    <th className="px-4 py-3 font-medium">Delivery</th>
                    <th className="px-4 py-3 font-medium">Placed</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {toPack.orders.map(({ id, data }) => (
                    <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">{data.customer.customerName || 'Guest'}</span>
                        <span className="block text-caption text-muted-foreground tabular-nums">{data.customer.phoneNumber}</span>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        <OrderPackingList product={data.product} />
                      </td>
                      <td className="px-4 py-3 text-foreground capitalize">
                        {data.delivery.method}
                        {data.delivery.method === 'pickup' && data.delivery.pickupStationName
                          ? ` — ${data.delivery.pickupStationName}`
                          : null}
                        {/*
                          Not paid for yet (§ pay on delivery). Said on
                          the packing screen as well as the delivery
                          one, because it changes what the person
                          handing the box over has to do.
                        */}
                        {data.payment?.dueOnDelivery ? (
                          <span className="mt-1 block text-caption font-semibold text-warning normal-case">
                            Unpaid — collect KES {data.pricing.totalKes.toLocaleString()}
                          </span>
                        ) : null}
                        {/*
                          Where it is actually going. A door order
                          without its address is not something anyone
                          can deliver.
                        */}
                        {data.delivery.method === 'door' && data.delivery.addressText ? (
                          <span className="mt-0.5 block text-caption text-muted-foreground normal-case">
                            {data.delivery.addressText}
                          </span>
                        ) : null}
                        {/*
                          This is the last screen before the box leaves,
                          so it is the last chance to notice that money
                          is still owed on it. Unmissable on purpose:
                          once it is on the van, nobody is collecting.
                        */}
                        {data.delivery.feeCollection === 'on_delivery' ? (
                          <span className="mt-1 block text-caption font-semibold text-warning normal-case">
                            Collect KES {data.delivery.feeKes.toLocaleString()} on delivery
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDate(data.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <MarkDispatchedButton orderId={id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {toPack.nextCursor ? (
          <div className="flex justify-center">
            <Button asChild variant="outline">
              <Link href={`/warehouse?packCursor=${toPack.nextCursor}${courierCursor ? `&courierCursor=${courierCursor}` : ''}`}>
                Load more
              </Link>
            </Button>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">Ready for courier</h2>
          <span className="rounded-full bg-border/40 px-2 py-0.5 text-caption text-muted-foreground">
            {readyForCourier.shipments.length}
          </span>
        </div>

        {readyForCourier.shipments.length === 0 ? (
          <EmptyState icon={Truck} title="Nothing waiting on a courier booking" description="Paid door-delivery orders needing a manual Tushop booking will show here." />
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Recipient</th>
                    <th className="px-4 py-3 font-medium">County</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {readyForCourier.shipments.map(({ id, data }) => (
                    <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">{data.recipientName}</span>
                        <span className="block text-caption text-muted-foreground tabular-nums">{data.recipientPhone}</span>
                      </td>
                      <td className="px-4 py-3 text-foreground">{data.county}</td>
                      <td className="px-4 py-3">
                        <ShipmentStatusBadge status={data.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <CompleteManualBookingDialog shipmentId={id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {readyForCourier.nextCursor ? (
          <div className="flex justify-center">
            <Button asChild variant="outline">
              <Link href={`/warehouse?courierCursor=${readyForCourier.nextCursor}${packCursor ? `&packCursor=${packCursor}` : ''}`}>
                Load more
              </Link>
            </Button>
          </div>
        ) : null}
      </section>

      {/*
        The last step of the job. An order is not finished when it
        leaves the building — it is finished when the customer has it,
        and whoever delivered it is the one who knows.
      */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">Out for delivery</h2>
          <span className="rounded-full bg-border/40 px-2 py-0.5 text-caption text-muted-foreground">
            {outForDelivery.orders.length}
          </span>
        </div>

        {outForDelivery.orders.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="Nothing out for delivery"
            description="Orders you have marked dispatched will wait here until the customer has them."
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Going to</th>
                    <th className="px-4 py-3 font-medium">Placed</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {outForDelivery.orders.map(({ id, data }) => (
                    <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">
                          {data.customer.customerName || 'Guest'}
                        </span>
                        <span className="block text-caption text-muted-foreground tabular-nums">
                          {data.customer.phoneNumber}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground capitalize">
                        {data.delivery.method}
                        {data.delivery.method === 'pickup' && data.delivery.pickupStationName
                          ? ` — ${data.delivery.pickupStationName}`
                          : null}
                        {data.delivery.method === 'door' && data.delivery.addressText ? (
                          <span className="mt-0.5 block text-caption text-muted-foreground normal-case">
                            {data.delivery.addressText}
                          </span>
                        ) : null}
                        {/*
                          Still owed, and this is the doorstep. Last
                          chance to collect it.
                        */}
                        {data.payment?.dueOnDelivery ? (
                          <span className="mt-1 block text-caption font-semibold text-warning normal-case">
                            Unpaid — collect KES {data.pricing.totalKes.toLocaleString()}
                          </span>
                        ) : null}
                        {data.delivery.feeCollection === 'on_delivery' ? (
                          <span className="mt-1 block text-caption font-semibold text-warning normal-case">
                            Collect KES {data.delivery.feeKes.toLocaleString()} on delivery
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {formatDate(data.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-end gap-2">
                          {/*
                            The money, before the button that says the
                            job is done. An order marked delivered with
                            payment still outstanding is one nobody
                            goes back for.
                          */}
                          {data.payment?.dueOnDelivery ? (
                            <CollectPaymentButton
                              orderId={id}
                              amountKes={data.pricing.totalKes}
                              phoneNumber={data.customer.phoneNumber}
                            />
                          ) : null}
                          <MarkDispatchedButton orderId={id} to="delivered" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {outForDelivery.nextCursor ? (
          <div className="flex justify-center">
            <Button asChild variant="outline">
              <Link
                href={`/warehouse?outCursor=${outForDelivery.nextCursor}${packCursor ? `&packCursor=${packCursor}` : ''}${courierCursor ? `&courierCursor=${courierCursor}` : ''}`}
              >
                Load more
              </Link>
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
