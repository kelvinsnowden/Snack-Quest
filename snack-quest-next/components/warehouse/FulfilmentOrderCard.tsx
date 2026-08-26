import { Card } from '@/components/ui/card';
import { OrderPackingList } from '@/components/warehouse/OrderPackingList';
import { RecordCostsForm } from '@/components/warehouse/RecordCostsForm';
import { CollectPaymentButton } from '@/components/warehouse/CollectPaymentButton';
import { MarkDispatchedButton } from '@/components/warehouse/MarkDispatchedButton';
import { formatDate } from '@/lib/orders/format';
import type { Order } from '@/types';

/**
 * One order, on the phone of the person fulfilling it
 * (§ Warehouse workspace).
 *
 * A card rather than a table row, because this screen is used on a
 * phone in a room with boxes in it. The table this replaced put the
 * customer's name and the action button off the side of a 390px
 * screen behind a horizontal scroll, which is a fine way to lay out a
 * spreadsheet and a poor way to lay out a job.
 *
 * The order is the unit of work, so everything about it is here: what
 * goes in the boxes, where it is going, what is still owed, what it
 * cost, and the one action that moves it on. Nothing is a link to
 * somewhere else — a packer with a box in one hand should not be
 * navigating.
 */
export function FulfilmentOrderCard({
  orderId,
  order,
  stage,
}: {
  orderId: string;
  order: Order;
  /** `pack` is still in the building; `out` is with the customer's courier. */
  stage: 'pack' | 'out';
}) {
  const { customer, delivery, pricing, payment, product, costs } = order;
  const outstandingKes = payment?.dueOnDelivery ? pricing.totalKes : 0;

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <span className="text-foreground block font-semibold">
            {customer.customerName || 'Guest'}
          </span>
          <span className="text-muted-foreground block text-caption tabular-nums">
            {customer.phoneNumber}
          </span>
        </div>
        <span className="text-muted-foreground shrink-0 text-caption tabular-nums">
          {formatDate(order.createdAt)}
        </span>
      </div>

      {/* Only while the box is still being packed. */}
      {stage === 'pack' ? <OrderPackingList product={product} /> : null}

      <div className="border-border flex flex-col gap-1 border-t pt-3">
        <span className="text-foreground text-sm font-medium capitalize">
          {delivery.method === 'pickup' ? 'Pickup' : 'Door delivery'}
          {delivery.method === 'pickup' && delivery.pickupStationName
            ? ` — ${delivery.pickupStationName}`
            : null}
        </span>
        {delivery.method === 'door' && delivery.addressText ? (
          <span className="text-muted-foreground text-sm">{delivery.addressText}</span>
        ) : null}
        {/*
          Two different sums, and confusing them costs real money: the
          whole order is unpaid, or only the courier's fee is.
        */}
        {outstandingKes > 0 ? (
          <span className="text-warning text-sm font-semibold">
            Unpaid — collect KES {outstandingKes.toLocaleString()}
          </span>
        ) : null}
        {delivery.feeCollection === 'on_delivery' ? (
          <span className="text-warning text-sm font-semibold">
            Collect KES {delivery.feeKes.toLocaleString()} delivery fee on delivery
          </span>
        ) : null}
      </div>

      {/*
        What it cost, entered by the only person who knows
        (§ fulfilment records the real cost). On the card rather than
        behind a link, because it is recorded in the same minute as the
        packing it describes.
      */}
      <details className="border-border rounded-lg border p-3" open={stage === 'out' && !costs}>
        <summary className="text-foreground cursor-pointer text-sm font-medium">
          {costs
            ? `Cost recorded — KES ${(costs.goodsCostKes + costs.otherCostKes).toLocaleString()}`
            : 'Record what this cost'}
        </summary>
        <div className="mt-3">
          <RecordCostsForm
            orderId={orderId}
            revenueKes={pricing.totalKes}
            existing={
              costs
                ? {
                    goodsCostKes: costs.goodsCostKes,
                    otherCostKes: costs.otherCostKes,
                    note: costs.note,
                  }
                : null
            }
          />
          {costs ? (
            <p className="text-muted-foreground mt-2 text-caption">
              Last entered by {costs.recordedByName}.
            </p>
          ) : null}
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {/*
          The money before the button that closes the job. An order
          marked done with payment outstanding is one nobody goes back
          for.
        */}
        {outstandingKes > 0 ? (
          <CollectPaymentButton
            orderId={orderId}
            amountKes={outstandingKes}
            phoneNumber={customer.phoneNumber}
          />
        ) : null}
        <MarkDispatchedButton
          orderId={orderId}
          to={stage === 'pack' ? 'dispatched' : 'delivered'}
          deliveryMethod={delivery.method}
          outstandingKes={outstandingKes}
        />
      </div>
    </Card>
  );
}
