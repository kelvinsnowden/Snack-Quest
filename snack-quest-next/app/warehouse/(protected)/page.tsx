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
import { FulfilmentOrderCard } from '@/components/warehouse/FulfilmentOrderCard';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { orderLines } from '@/types/checkoutLine';

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

  /*
   * Where to buy each snack on this screen (§ the packer needs the
   * supermarket too). One lookup for every snack across every order
   * rather than one per order — the same packet turns up on most of
   * them, and `findManyById` de-duplicates before it reads.
   *
   * Read live rather than off the order: a sourcing note answers
   * "where do I get this today", so a supplier that changed last month
   * has to reach the packer now. Best-effort — the packing list is
   * still worth having without it.
   */
  const snackIds = toPack.orders.flatMap(({ data }) =>
    orderLines(data.product).flatMap((line) =>
      (line.guaranteedPicks ?? data.product.guaranteedPicks ?? []).map((pick) => pick.snackItemId),
    ),
  );
  const sourcingNotes = await snackItemRepository
    .findManyById(snackIds)
    .then((snacks) => new Map([...snacks].map(([id, snack]) => [id, snack.sourcingNote])))
    .catch(() => new Map<string, string | null>());

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
          <div className="flex flex-col gap-3">
            {toPack.orders.map(({ id, data }) => (
              <FulfilmentOrderCard
                key={id}
                orderId={id}
                order={data}
                stage="pack"
                sourcingNotes={sourcingNotes}
              />
            ))}
          </div>
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
            description="Orders you have marked on their way will wait here until the customer has them."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {outForDelivery.orders.map(({ id, data }) => (
              <FulfilmentOrderCard key={id} orderId={id} order={data} stage="out" />
            ))}
          </div>
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
